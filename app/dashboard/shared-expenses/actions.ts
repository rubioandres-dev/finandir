'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { guardarTransaccion } from '@/app/dashboard/actions'
import { CODIGOS_DE_MONEDA } from '@/lib/monedas'
import {
  FALTA_MIGRACION_CIFRADOS,
  FALTA_MIGRACION_COMPARTIDOS,
  FALTA_MIGRACION_MIEMBROS,
  dividirEnPartesIguales,
  faltaLaColumna,
  faltaLaTabla,
} from '@/lib/shared-expenses-service'
import { libroDelServidor } from '@/lib/almacen/acceso'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'

export type ResultadoCompartido = { ok: true } | { ok: false; error: string }

/**
 * Un sobre del grupo: `v1.<iv>.<datos>` en base64.
 *
 * Se valida la FORMA, no el contenido: que sea una cadena con la pinta de algo
 * cifrado es lo único comprobable desde acá. Sirve para que un bug del cliente
 * que mande el objeto sin cifrar no termine guardado en claro sin que nadie se
 * entere — que es exactamente el modo en que este tipo de cambios se deshace
 * solo con el tiempo.
 */
const sobreSchema = z
  .string()
  .regex(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/, 'El dato no viene cifrado.')

/** Traduce el código de Postgres a "corré tal migración". */
function porMigracion(codigo?: string): string | null {
  if (faltaLaTabla(codigo)) return FALTA_MIGRACION_COMPARTIDOS
  if (faltaLaColumna(codigo)) return FALTA_MIGRACION_MIEMBROS
  // 23502 = NOT NULL. Pasa exactamente en un caso: el código ya manda el gasto
  // cifrado y la base todavía exige las columnas en claro. Sin esta línea el
  // usuario ve "null value in column amount", que no le dice qué hacer.
  if (codigo === '23502') return FALTA_MIGRACION_CIFRADOS
  return null
}

/**
 * Con qué nombre entra alguien a un grupo.
 *
 * Se copia al miembro en vez de leerse del perfil en cada consulta: el nombre
 * dentro del grupo es un dato del grupo. Si mañana el usuario cambia su nombre
 * de perfil, los gastos viejos siguen diciendo con quién se repartieron.
 */
async function nombreVisible(supabase: SupabaseClient, user: User): Promise<string> {
  // Nunca corta el alta: entrar a un grupo no puede fallar porque el perfil no
  // se pudo leer. Sin nombre hay dos alternativas mas abajo.
  let delPerfil: string | undefined
  try {
    delPerfil = (await (await libroDelServidor(supabase, user.id)).leer('perfil'))
      .display_name?.trim()
  } catch {
    delPerfil = undefined
  }

  if (delPerfil) return delPerfil.slice(0, 100)

  const deMetadata =
    typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : ''
  if (deMetadata) return deMetadata.slice(0, 100)

  // Último recurso: la parte local del mail. Mejor que "Miembro" a secas.
  return (user.email?.split('@')[0] ?? 'Miembro').slice(0, 100)
}

const espacioSchema = z.object({
  nombre: z.string().trim().min(1, 'Poné un nombre.').max(80, 'El nombre es muy largo.'),
  tipo: z.enum(['CONVIVENCIA', 'VIAJE', 'EVENTO']),
  moneda: z.enum(CODIGOS_DE_MONEDA),
})

/**
 * Crea un grupo y mete al creador como ADMIN.
 *
 * Son dos inserts y no hay transacción: PostgREST no las expone. Si el segundo
 * falla, queda un espacio sin miembros — invisible para todos, incluido su
 * creador, porque la policy de lectura de gastos pide membresía. Se borra el
 * espacio para no dejar basura.
 */
export async function crearEspacio(entrada: {
  nombre: string
  tipo: 'CONVIVENCIA' | 'VIAJE' | 'EVENTO'
  moneda: string
}): Promise<ResultadoCompartido> {
  const datos = espacioSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { data: espacio, error } = await supabase
    .from('shared_spaces')
    .insert({
      name: datos.data.nombre,
      type: datos.data.tipo,
      currency: datos.data.moneda,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !espacio) {
    const aviso = porMigracion(error?.code)
    if (aviso) return { ok: false, error: aviso }
    return { ok: false, error: `No se pudo crear el grupo: ${error?.message}` }
  }

  const { error: errorMiembro } = await supabase.from('shared_space_members').insert({
    space_id: espacio.id,
    user_id: user.id,
    role: 'ADMIN',
    display_name: await nombreVisible(supabase, user),
  })

  if (errorMiembro) {
    await supabase.from('shared_spaces').delete().eq('id', espacio.id)
    return { ok: false, error: `No se pudo crear el grupo: ${errorMiembro.message}` }
  }

  revalidatePath('/dashboard/shared-expenses')
  redirect(`/dashboard/shared-expenses/${espacio.id}`)
}

/**
 * Suma al usuario actual a un grupo. Idempotente: reentrar no duplica.
 *
 * POR QUÉ NO ES UN UPSERT
 *
 * Antes hacía `upsert(..., { onConflict: 'space_id,user_id' })`. Desde la 015 el
 * índice único de esa combinación es PARCIAL (`where user_id is not null`),
 * porque dos invitados sin cuenta SÍ pueden repetirse en el mismo grupo. Y
 * PostgREST no puede nombrar un índice parcial en un ON CONFLICT: devuelve
 * 42P10, el mismo error que traía roto el guardado de objetivos antes de la 012.
 *
 * Se resuelve leyendo primero. No hay carrera real que importe: dos toques
 * simultáneos del mismo usuario sobre el mismo QR es un caso que el índice
 * parcial igual atrapa del lado de la base.
 */
export async function unirseAEspacio(spaceId: string): Promise<ResultadoCompartido> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { data: yaEsta, error: errorLectura } = await supabase
    .from('shared_space_members')
    .select('id')
    .eq('space_id', spaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (errorLectura) {
    const aviso = porMigracion(errorLectura.code)
    if (aviso) return { ok: false, error: aviso }
    return { ok: false, error: `No se pudo entrar al grupo: ${errorLectura.message}` }
  }

  if (yaEsta) {
    revalidatePath('/dashboard/shared-expenses')
    return { ok: true }
  }

  const { error } = await supabase.from('shared_space_members').insert({
    space_id: spaceId,
    user_id: user.id,
    role: 'MEMBER',
    display_name: await nombreVisible(supabase, user),
  })

  if (error) {
    const aviso = porMigracion(error.code)
    if (aviso) return { ok: false, error: aviso }
    return { ok: false, error: `No se pudo entrar al grupo: ${error.message}` }
  }

  revalidatePath('/dashboard/shared-expenses')
  return { ok: true }
}

// --- Miembros sin cuenta ------------------------------------------------------

const invitadoSchema = z.object({
  spaceId: z.uuid(),
  nombre: z.string().trim().min(1, 'Poné un nombre.').max(100, 'El nombre es muy largo.'),
})

/**
 * Agrega a alguien que no usa AUREM.
 *
 * Es una fila con `user_id` nulo: participa de los repartos y aparece en los
 * saldos, pero no tiene sesión ni ve el grupo. Es la razón de ser de toda la
 * 015 — sin esto sólo se podía repartir entre gente que ya tuviera cuenta.
 */
export async function agregarInvitado(
  entrada: z.infer<typeof invitadoSchema>
): Promise<ResultadoCompartido> {
  const datos = invitadoSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } = await supabase.from('shared_space_members').insert({
    space_id: datos.data.spaceId,
    user_id: null,
    role: 'MEMBER',
    display_name: datos.data.nombre,
  })

  if (error) {
    const aviso = porMigracion(error.code)
    if (aviso) return { ok: false, error: aviso }
    return { ok: false, error: `No se pudo agregar: ${error.message}` }
  }

  revalidatePath(`/dashboard/shared-expenses/${datos.data.spaceId}`)
  return { ok: true }
}

/**
 * SACAR A ALGUIEN DEL GRUPO NO VIVE ACÁ
 *
 * Había una `quitarMiembro` que borraba la fila y devolvía `ok`. Con los gastos
 * cifrados eso es mentira: el que se va conserva la llave del grupo en su
 * navegador, así que sigue pudiendo leer todo lo que ya estaba escrito. Borrar
 * el miembro sin rotar la llave expulsa en la lista y no en los datos.
 *
 * Expulsar de verdad es rotar la llave y re-cifrar el grupo entero, y las dos
 * cosas necesitan la llave abierta — o sea, el navegador. Está en
 * `lib/almacen/expulsion.ts`. Esta nota queda en lugar de la función para que
 * el próximo que la busque acá encuentre el motivo y no la escriba de nuevo.
 */

/**
 * Lo que el servidor puede saber de un gasto compartido.
 *
 * EL IMPORTE Y LA DESCRIPCIÓN NO ESTÁN, Y NO ES UN OLVIDO
 *
 * Viajan adentro de `payloadCifrado`, que el cliente arma con la llave del
 * grupo. Acá no hay forma de validar que el reparto sume 100% ni que el monto
 * sea positivo: validar es leer, y leer es justo lo que no queremos poder.
 *
 * Esa validación no desapareció, se mudó: la hace el formulario antes de
 * cifrar, que es donde el usuario puede corregirla. Lo que queda acá es lo
 * único que el servidor necesita para archivar la fila y para que la RLS
 * decida: de qué grupo es, quién pagó y de cuándo.
 */
const gastoSchema = z.object({
  spaceId: z.uuid(),
  /** Id del MIEMBRO que pagó, no del usuario: puede ser un invitado sin cuenta. */
  pagadoPor: z.uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.'),
  /** Con qué generación de la llave se cifró. Sin esto no se sabe con cuál abrir. */
  generacion: z.number().int().positive(),
  payloadCifrado: sobreSchema,
})

export async function crearGastoCompartido(
  entrada: z.infer<typeof gastoSchema>
): Promise<ResultadoCompartido> {
  const datos = gastoSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } = await supabase.from('shared_transactions').insert({
    space_id: datos.data.spaceId,
    paid_by_member_id: datos.data.pagadoPor,
    date: datos.data.fecha,
    payload_cifrado: datos.data.payloadCifrado,
    generacion: datos.data.generacion,
    created_by: user.id,
  })

  if (error) {
    const aviso = porMigracion(error.code)
    if (aviso) return { ok: false, error: aviso }
    return { ok: false, error: `No se pudo guardar: ${error.message}` }
  }

  revalidatePath(`/dashboard/shared-expenses/${datos.data.spaceId}`)
  return { ok: true }
}

// --- Liquidaciones ------------------------------------------------------------

const pagoSchema = z
  .object({
    spaceId: z.uuid(),
    deMiembro: z.uuid(),
    aMiembro: z.uuid(),
    moneda: z.enum(CODIGOS_DE_MONEDA),
    generacion: z.number().int().positive(),
    /** Lleva el importe y la nota. Ver `gastoSchema`. */
    payloadCifrado: sobreSchema,
  })
  .refine((d) => d.deMiembro !== d.aMiembro, {
    message: 'El que paga y el que cobra tienen que ser distintos.',
    path: ['aMiembro'],
  })

/**
 * Registra que un miembro le pagó a otro.
 *
 * POR QUÉ ES UNA FILA Y NO UN BOOLEANO
 *
 * Antes "saldar" ponía `shared_splits.is_settled = true`. Eso decía que una
 * deuda se pagó, pero no quién le pagó a quién, cuánto ni cuándo: no había
 * historial, no se podía deshacer un error, y un pago parcial no tenía forma de
 * representarse. Como fila, el pago entra al cálculo de saldos como un
 * movimiento más y todo cierra sin casos especiales.
 *
 * Desde la 023 el importe va cifrado. Quiénes son las partes sigue en claro:
 * son claves foráneas con cascada, y "A y B arreglaron algo" no dice cuánto.
 */
export async function registrarPago(
  entrada: z.infer<typeof pagoSchema>
): Promise<ResultadoCompartido> {
  const datos = pagoSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } = await supabase.from('shared_settlements').insert({
    space_id: datos.data.spaceId,
    from_member_id: datos.data.deMiembro,
    to_member_id: datos.data.aMiembro,
    currency: datos.data.moneda,
    payload_cifrado: datos.data.payloadCifrado,
    generacion: datos.data.generacion,
    created_by: user.id,
  })

  if (error) {
    const aviso = porMigracion(error.code)
    if (aviso) return { ok: false, error: aviso }
    return { ok: false, error: `No se pudo registrar el pago: ${error.message}` }
  }

  revalidatePath(`/dashboard/shared-expenses/${datos.data.spaceId}`)
  return { ok: true }
}

/** Deshace un pago mal cargado. Los saldos vuelven solos al estado anterior. */
export async function borrarPago(
  spaceId: string,
  pagoId: string
): Promise<ResultadoCompartido> {
  const supabase = await createClient()
  const { error } = await supabase.from('shared_settlements').delete().eq('id', pagoId)

  if (error) return { ok: false, error: `No se pudo borrar el pago: ${error.message}` }

  revalidatePath(`/dashboard/shared-expenses/${spaceId}`)
  return { ok: true }
}

// --- Objetivos del grupo ------------------------------------------------------

const objetivoSchema = z.object({
  spaceId: z.uuid(),
  tipo: z.enum(['CATEGORY_BUDGET', 'GROUP_SAVINGS']),
  fechaObjetivo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.')
    .nullable()
    .optional(),
  moneda: z.enum(CODIGOS_DE_MONEDA),
  generacion: z.number().int().positive(),
  /** Lleva el título, la meta, el aporte y la categoría. Ver `gastoSchema`. */
  payloadCifrado: sobreSchema,
})

/**
 * Crea un objetivo del grupo: un techo de gasto por categoría o una meta de
 * ahorro conjunta.
 *
 * Es el equivalente grupal de `category_budgets` y de los objetivos personales,
 * pero vive en su propia tabla y no se mezcla con aquellos: el techo de gasto de
 * una casa compartida no es el techo de gasto de ninguno de sus miembros, y
 * sumarlos al presupuesto personal contaría dos veces la misma plata.
 *
 * El tipo queda en claro porque decide cómo se muestra y no dice nada de plata.
 */
export async function guardarObjetivoDeGrupo(
  entrada: z.infer<typeof objetivoSchema>
): Promise<ResultadoCompartido> {
  const datos = objetivoSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } = await supabase.from('shared_goals').insert({
    space_id: datos.data.spaceId,
    type: datos.data.tipo,
    target_date: datos.data.fechaObjetivo ?? null,
    currency: datos.data.moneda,
    payload_cifrado: datos.data.payloadCifrado,
    generacion: datos.data.generacion,
    created_by: user.id,
  })

  if (error) {
    const aviso = porMigracion(error.code)
    if (aviso) return { ok: false, error: aviso }
    return { ok: false, error: `No se pudo guardar el objetivo: ${error.message}` }
  }

  revalidatePath(`/dashboard/shared-expenses/${datos.data.spaceId}`)
  return { ok: true }
}

export async function borrarObjetivoDeGrupo(
  spaceId: string,
  objetivoId: string
): Promise<ResultadoCompartido> {
  const supabase = await createClient()
  const { error } = await supabase.from('shared_goals').delete().eq('id', objetivoId)

  if (error) return { ok: false, error: `No se pudo borrar: ${error.message}` }

  revalidatePath(`/dashboard/shared-expenses/${spaceId}`)
  return { ok: true }
}

// --- Calculadora de salidas --------------------------------------------------


/** Corta un texto para que entre en su columna sin que Postgres lo rechace. */
function recortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1).trimEnd()}…`
}

/** "3 personas", "1 persona". El plural mal puesto se nota. */
function contarPersonas(cantidad: number): string {
  return cantidad === 1 ? '1 persona' : `${cantidad} personas`
}

const salidaSchema = z
  .object({
    /** Total de la factura, propina ya incluida. */
    total: z.number().positive('El total tiene que ser mayor a cero.'),
    personas: z
      .number()
      .int()
      .min(2, 'Una salida compartida es de dos personas para arriba.')
      .max(100, 'Son demasiadas personas.'),
    descripcion: z.string().trim().min(1, 'Escribí una descripción.').max(120),
    categoria: z.string().trim().min(1, 'Elegí la categoría del gasto.').max(60),
    moneda: z.enum(CODIGOS_DE_MONEDA),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.'),
    /** Cuenta o tarjeta de la que sale la plata. Null = la de la moneda. */
    cuentaId: z.uuid().nullable().optional(),
    /**
     * Los OTROS participantes, sin el usuario. Los nombres son OPCIONALES: la
     * lista vacía es un caso válido y genera una sola cuenta por cobrar
     * acumulada. Si viene con datos tiene que estar completa — media lista
     * dejaría plata sin asignar a nadie.
     */
    nombres: z.array(z.string().trim().min(1).max(80)).default([]),
    modo: z.enum(['TOTAL', 'SOLO_MI_PARTE']),
  })
  .refine((d) => d.nombres.length === 0 || d.nombres.length === d.personas - 1, {
    message: 'Completá los nombres de todos los demás participantes, o dejá la lista vacía.',
    path: ['nombres'],
  })

/**
 * Registra una salida pagada en grupo.
 *
 * LAS DOS OPCIONES NO SON LA MISMA CUENTA
 *
 * A) Pagué el total. Son TRES asientos y no uno, porque son tres hechos
 *    distintos y colapsarlos miente en algún lado:
 *
 *      1. SALIDA BANCARIA por el total. De la cuenta o tarjeta salió la factura
 *         completa. Si registrás solo tu parte, el saldo del banco no cuadra con
 *         el resumen.
 *      2. GASTO REAL por tu cuota parte, imputado a la categoría elegida. Si
 *         imputás el total, tu mes se ve peor de lo que fue y el presupuesto de
 *         "Comida" se come plata que era de otros.
 *      3. CUENTAS POR COBRAR por el resto. Esa plata no es un gasto tuyo: es un
 *         activo. Cuando te transfieran, cancelás la deuda — y no entra como
 *         "ingreso", porque no ganaste nada, recuperaste lo tuyo. Contarlo como
 *         ingreso inflaría tu tasa de ahorro con plata que nunca fue tuya.
 *
 *    El 1 y el 2 se resuelven con dos filas sobre la MISMA cuenta: un EXPENSE
 *    por tu parte (que va a la categoría) y un TRANSFER por lo que adelantaste.
 *    El TRANSFER es la pieza clave: resta del saldo igual que un gasto —así el
 *    banco cierra por el total— pero queda AFUERA de ingresos y gastos en todos
 *    los reportes (`construirFlujoMensual` lo saltea, el Home filtra por
 *    `type === 'EXPENSE'`). Es exactamente lo que se necesita: plata que se fue
 *    de la cuenta sin ser un gasto propio.
 *
 * B) Solo mi parte. Se registra el gasto por tu cuota y listo, sin adelanto ni
 *    deuda. Sirve cuando cada uno paga lo suyo en el momento.
 */
export async function registrarSalida(
  entrada: z.infer<typeof salidaSchema>
): Promise<ResultadoCompartido> {
  const datos = salidaSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { total, personas, descripcion, categoria, moneda, fecha, cuentaId, nombres } = datos.data
  const esSoloMiParte = datos.data.modo === 'SOLO_MI_PARTE'

  // Las N partes suman EXACTAMENTE el total: el centavo que sobra al dividir no
  // se pierde ni se reclama dos veces. La primera es la del usuario.
  const partes = dividirEnPartesIguales(total, personas)
  const miParte = partes[0]
  const partesDeLosDemas = partes.slice(1)
  const porCobrar = Math.round(partesDeLosDemas.reduce((s, p) => s + p, 0) * 100) / 100
  const otros = personas - 1

  // --- 2. El gasto real: solo tu cuota parte, en la categoría elegida --------
  // Es la transacción MADRE: las cuentas por cobrar apuntan acá.
  const gasto = await guardarTransaccion({
    amount: miParte,
    type: 'EXPENSE',
    currency: moneda,
    category_suggested: categoria,
    description: descripcion,
    date: fecha,
    account_id: cuentaId ?? null,
  })

  if (!gasto.ok) return { ok: false, error: gasto.error }

  if (esSoloMiParte) {
    revalidatePath('/dashboard', 'layout')
    return { ok: true }
  }

  // --- 1. Completar la salida bancaria: lo que adelantaste por los demás -----
  if (porCobrar > 0) {
    const adelanto = await guardarTransaccion({
      amount: porCobrar,
      type: 'TRANSFER',
      currency: moneda,
      // Las transferencias van sin categoría por CHECK del esquema, y está
      // bien: adelantar plata ajena no es gastar en ningún rubro propio.
      category_suggested: '',
      description: recortar(`Adelanto por ${descripcion} (${contarPersonas(otros)})`, 120),
      date: fecha,
      account_id: cuentaId ?? null,
    })

    if (!adelanto.ok) {
      // Sin el adelanto el saldo de la cuenta quedaría corto por el total de la
      // factura. Se deshace el gasto: es preferible no registrar nada a dejar
      // una mitad que el usuario no tiene forma de detectar.
      if (gasto.id) {
        await (await libroDelServidor(supabase, user.id)).borrarMovimiento(gasto.id)
      }
      return { ok: false, error: adelanto.error }
    }
  }

  // --- 3. Las cuentas por cobrar --------------------------------------------
  // El `porCobrar > 0` cubre el caso degenerado de una cuenta tan chica que la
  // parte de los demás redondea a cero: no hay nada que cobrar ni que adelantar.
  if (porCobrar > 0) {
    const conNombres = nombres.length > 0

    const filas = conNombres
      ? // Una por persona, por su cuota parte. Así se cobra de a uno: que Sofía
        // te pague no borra lo que te debe Gastón.
        //
        // El filtro de los ceros no es decorativo: `debts` exige
        // `total_amount > 0`, y una cuenta de dos centavos entre tres personas
        // deja a la última con 0,00. Sin esto el insert entero rebota con 23514
        // DESPUÉS de haber guardado los movimientos. Descartar esas filas no
        // pierde plata —suman cero— y `porCobrar` sigue cerrando contra el
        // adelanto.
        nombres
          .map((nombre, indice) => ({
            counterparty_name: recortar(nombre, 80),
            monto: partesDeLosDemas[indice] ?? 0,
            description: recortar(`Por cobrar - ${descripcion}`, 200),
          }))
          .filter((f) => f.monto > 0)
      : // Sin nombres no hay a quién imputarle qué: un solo registro por el
        // acumulado. El usuario sabe con quién salió; la app no necesita saberlo
        // para que el número cierre.
        [
          {
            counterparty_name: recortar(`Salida grupal (${contarPersonas(otros)})`, 80),
            monto: porCobrar,
            description: recortar(
              `Por cobrar - Salida grupal (${contarPersonas(otros)}) · ${descripcion}`,
              200
            ),
          },
        ]

    const comun = {
      user_id: user.id,
      currency: moneda,
      type: 'OWED_TO_ME' as const,
    }

    const sinVinculo = filas.map((f) => ({
      ...comun,
      counterparty_name: f.counterparty_name,
      total_amount: f.monto,
      remaining_amount: f.monto,
      description: f.description,
    }))

    // Un insert vacío no tiene sentido y PostgREST lo trata como un error: sólo
    // puede pasar si el filtro de ceros se llevó todas las filas.
    if (sinVinculo.length > 0) {
      const ahora = new Date().toISOString()

      try {
        await (await libroDelServidor(supabase, user.id)).mutar('deudas', (deudas) => [
          ...deudas,
          ...sinVinculo.map((f) => ({
            ...f,
            id: crypto.randomUUID(),
            created_at: ahora,
            is_settled: false,
            // Una cuenta por cobrar de una salida no tiene vencimiento: se
            // cobra cuando se cobra.
            due_date: null,
            // El vinculo al gasto que las origino: es lo que permite ver las
            // cuentas por cobrar de una salida como un grupo.
            source_transaction_id: gasto.id ?? null,
          })),
        ])
      } catch (error) {
        // Los movimientos ya quedaron registrados y el saldo de la cuenta
        // cierra. Avisar es más honesto que fingir que salió todo bien, y que
        // borrar el gasto dejando al usuario sin nada: la deuda se puede cargar
        // a mano desde Deudas.
        const detalle = error instanceof Error ? error.message : 'Error desconocido.'
        return {
          ok: false,
          error: `El gasto se registró, pero no se pudo crear la cuenta por cobrar: ${detalle}`,
        }
      }
    }
  }

  revalidatePath('/dashboard', 'layout')
  return { ok: true }
}
