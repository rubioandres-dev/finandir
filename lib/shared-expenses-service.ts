// Las de cálculo (`repartir`, `dividirEnPartesIguales`, `calcularBalances`) son
// puras y corren en los dos lados.
//
// De las que reciben un `SupabaseClient`, `cargarEspacios` y
// `cargarBaseDelEspacio` son del servidor: leen lo que el servidor puede leer.
// `cargarEspacioCrudo` corre en el NAVEGADOR, porque lo que trae viene cifrado
// y sólo tiene sentido donde está la llave.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EspacioCrudo } from './almacen/compartidos'
import type { Moneda } from './types'

/**
 * Gastos compartidos: espacios, repartos y saldos.
 *
 * EL MODELO EN UNA LÍNEA
 *
 * Cada gasto tiene UN pagador y N repartos. El pagador puso todo; cada
 * participante debe su parte. El balance de una persona es lo que puso menos lo
 * que le tocaba: positivo significa que le deben.
 *
 * LA UNIDAD ES EL MIEMBRO, NO EL USUARIO (desde la 015)
 *
 * Todo lo de acá se identifica por `member_id` y no por `user_id`. El cambio
 * parece cosmético y no lo es: un miembro puede NO tener cuenta en AUREM. Antes
 * un participante era necesariamente un `auth.users`, así que no se podía
 * repartir una cena con alguien que no usa la app — que es el caso más común de
 * una cena. Un invitado es una fila de `shared_space_members` con `user_id`
 * nulo: existe dentro del grupo y en ningún otro lado.
 */

export type TipoDeEspacio = 'CONVIVENCIA' | 'VIAJE' | 'EVENTO'
export type TipoDeReparto = 'EQUAL' | 'PERCENTAGE' | 'EXACT'

export type Espacio = {
  id: string
  name: string
  type: TipoDeEspacio
  currency: Moneda
  created_by: string
  miembros: number
}

export type Miembro = {
  id: string
  /** `null` = invitado sin cuenta. No tiene sesión ni ve el grupo. */
  user_id: string | null
  role: 'ADMIN' | 'MEMBER'
  display_name: string
}

export type Reparto = {
  member_id: string
  percentage: number
  amount_owed: number
  is_settled: boolean
}

/**
 * La categoria, copiada adentro de la fila compartida (migracion 019).
 *
 * Es una FOTO y no un vinculo: renombrar una categoria propia no cambia los
 * gastos compartidos ya cargados. Mismo criterio que `amount_owed`, que congela
 * el reparto en vez de recalcularlo.
 *
 * Existe por dos razones. La que empuja: con el modo cifrado las categorias se
 * van a un bloque que el servidor no puede leer, asi que la FK a `categories`
 * no puede seguir existiendo. La que ya estaba: cada miembro tiene SUS propias
 * categorias, y la RLS impedia que los demas leyeran la del que cargo el gasto.
 * El nombre nunca se podia mostrar del otro lado.
 */
export type FotoDeCategoria = {
  nombre: string
  icono: string | null
  color: string | null
}

export type GastoCompartido = {
  id: string
  space_id: string
  paid_by_member_id: string
  /** Clave de agrupacion opaca. Solo su dueno puede resolverla. */
  category_id: string | null
  /** `null` en gastos anteriores a la 019 cuya categoria ya no existia. */
  categoria: FotoDeCategoria | null
  split_type: TipoDeReparto
  amount: number
  description: string
  date: string
  repartos: Reparto[]
}

/** Un pago de un miembro a otro para bajar la deuda. */
export type Liquidacion = {
  id: string
  from_member_id: string
  to_member_id: string
  amount: number
  currency: Moneda
  note: string | null
  created_at: string
}

export type ObjetivoDeGrupo = {
  id: string
  title: string
  type: 'CATEGORY_BUDGET' | 'GROUP_SAVINGS'
  category_id: string | null
  categoria: FotoDeCategoria | null
  target_amount: number
  monthly_contribution: number | null
  target_date: string | null
  currency: Moneda
}

export const FALTA_MIGRACION_COMPARTIDOS =
  'Falta el esquema de gastos compartidos. Ejecutá migrations/011_shared_expenses_and_modules.sql.'

export const FALTA_MIGRACION_CIFRADOS =
  'Falta el cifrado de gastos compartidos. Ejecutá migrations/020_llaves_de_grupo.sql ' +
  'y migrations/023_gastos_compartidos_cifrados.sql en el SQL Editor de Supabase.'

export const FALTA_MIGRACION_MIEMBROS =
  'Falta actualizar gastos compartidos. Ejecutá migrations/015_shared_members_and_settlements.sql ' +
  'y migrations/019_shared_categoria_desnormalizada.sql en el SQL Editor de Supabase.'

export function faltaLaTabla(codigo?: string): boolean {
  return codigo === 'PGRST205' || codigo === 'PGRST204' || codigo === '42P01'
}

/** 42703 = la columna no existe: falta la 015 sobre un esquema con la 011. */
export function faltaLaColumna(codigo?: string): boolean {
  return codigo === '42703'
}

// --- Reparto -----------------------------------------------------------------

/**
 * Reparte un importe en porcentajes, sin perder ni inventar centavos.
 *
 * EL PROBLEMA DEL CENTAVO
 *
 * Tres personas al 33,33% de $100 dan $99,99. Redondear cada parte por su
 * cuenta deja una diferencia que no aparece en ningún lado y hace que los
 * saldos nunca cierren en cero.
 *
 * La solución es el método del resto mayor: se redondea todo para abajo y los
 * centavos sobrantes se reparten de a uno entre los que tenían la fracción más
 * grande. La suma de las partes es EXACTAMENTE el total, siempre.
 */
export function repartir(
  total: number,
  porcentajes: { member_id: string; percentage: number }[]
): { member_id: string; percentage: number; amount_owed: number }[] {
  if (porcentajes.length === 0) return []

  const centavosTotales = Math.round(total * 100)

  const crudos = porcentajes.map((p) => {
    const exacto = (centavosTotales * p.percentage) / 100
    const piso = Math.floor(exacto)
    return { ...p, piso, resto: exacto - piso }
  })

  const asignados = crudos.reduce((suma, c) => suma + c.piso, 0)
  let sobrantes = centavosTotales - asignados

  // De mayor a menor fracción perdida: el que más cerca estaba de subir, sube.
  const orden = [...crudos].sort((a, b) => b.resto - a.resto)
  const extra = new Map<string, number>()
  for (const candidato of orden) {
    if (sobrantes <= 0) break
    extra.set(candidato.member_id, 1)
    sobrantes--
  }

  return crudos.map((c) => ({
    member_id: c.member_id,
    percentage: c.percentage,
    amount_owed: (c.piso + (extra.get(c.member_id) ?? 0)) / 100,
  }))
}

/**
 * Partes iguales entre N miembros, en porcentaje.
 *
 * El porcentaje se guarda con tres decimales (lo que admite la columna), así
 * que con tres personas da 33,333 y no 33,33. El monto igual lo cuadra
 * `repartir`: el porcentaje es el dato que el usuario eligió, el monto es el
 * que manda.
 */
export function porcentajesIguales(memberIds: string[]): {
  member_id: string
  percentage: number
}[] {
  if (memberIds.length === 0) return []
  const parte = Math.round((100 / memberIds.length) * 1000) / 1000
  return memberIds.map((member_id) => ({ member_id, percentage: parte }))
}

/**
 * Un importe partido en N partes iguales que SUMAN EXACTAMENTE el importe.
 *
 * POR QUÉ NO ES `total / n`
 *
 * Porque 100 entre 3 no da tres cuotas de 33,33: da 99,99 y falta un centavo. En
 * la Calculadora de Salidas ese centavo no es cosmético — la salida bancaria es
 * el total de la factura y las cuentas por cobrar tienen que cerrar contra ella.
 * Si no cierran, al usuario le queda un centavo eterno en "te deben" que nadie le
 * va a transferir nunca, o al revés, un centavo que cobró de más.
 *
 * Se reparte en centavos con el método del resto mayor, igual que `repartir`: los
 * primeros índices se quedan con el sobrante. Que el centavo de más caiga en la
 * parte del usuario (índice 0) es deliberado: es preferible poner un centavo de
 * más que reclamárselo a un amigo.
 */
export function dividirEnPartesIguales(total: number, n: number): number[] {
  if (n < 1) return []

  const centavosTotales = Math.round(total * 100)
  const base = Math.floor(centavosTotales / n)
  let sobrantes = centavosTotales - base * n

  return Array.from({ length: n }, () => {
    const extra = sobrantes > 0 ? 1 : 0
    sobrantes -= extra
    return (base + extra) / 100
  })
}

// --- Saldos ------------------------------------------------------------------

export type Balance = { member_id: string; balance: number }

/**
 * Lo que cada uno puso menos lo que le tocaba, ya neto de lo que se pagó.
 *
 * LAS LIQUIDACIONES ENTRAN ACÁ Y NO EN UNA VISTA APARTE
 *
 * Un pago de A a B sube el balance de A y baja el de B exactamente como lo
 * haría un gasto que A pagó y B consumió. Tratarlo como un movimiento más es lo
 * que hace que después de saldar todo el balance dé cero sin ningún caso
 * especial.
 */
export function calcularBalances(
  gastos: GastoCompartido[],
  miembros: string[],
  liquidaciones: Liquidacion[] = []
): Balance[] {
  const saldo = new Map<string, number>(miembros.map((id) => [id, 0]))

  for (const gasto of gastos) {
    saldo.set(
      gasto.paid_by_member_id,
      (saldo.get(gasto.paid_by_member_id) ?? 0) + gasto.amount
    )
    for (const reparto of gasto.repartos) {
      saldo.set(reparto.member_id, (saldo.get(reparto.member_id) ?? 0) - reparto.amount_owed)
    }
  }

  for (const pago of liquidaciones) {
    saldo.set(pago.from_member_id, (saldo.get(pago.from_member_id) ?? 0) + pago.amount)
    saldo.set(pago.to_member_id, (saldo.get(pago.to_member_id) ?? 0) - pago.amount)
  }

  return [...saldo].map(([member_id, balance]) => ({
    member_id,
    balance: Math.round(balance * 100) / 100,
  }))
}

export type Transferencia = { de: string; a: string; monto: number }

/**
 * Quién le paga a quién para saldar todo.
 *
 * POR QUÉ NO ES "CADA UNO LE PAGA A CADA UNO"
 *
 * Con cuatro personas y diez gastos, la lista literal de deudas cruzadas son
 * decenas de transferencias que en gran parte se cancelan entre sí. Este
 * algoritmo trabaja sobre los BALANCES NETOS: toma al que más debe y al que más
 * le deben y los cruza, repitiendo hasta que todos quedan en cero.
 *
 * Con N personas, produce como mucho N−1 transferencias. No es el óptimo
 * absoluto —encontrarlo es NP-difícil— pero está cerca y, sobre todo, es
 * explicable: cualquiera puede seguir el razonamiento.
 *
 * El umbral de un centavo evita que un resto de redondeo genere una
 * transferencia de $0,00 que nadie va a hacer.
 */
export function calcularLiquidacion(balances: Balance[]): Transferencia[] {
  const deudores = balances.filter((b) => b.balance < -0.005).map((b) => ({ ...b }))
  const acreedores = balances.filter((b) => b.balance > 0.005).map((b) => ({ ...b }))

  deudores.sort((a, b) => a.balance - b.balance)
  acreedores.sort((a, b) => b.balance - a.balance)

  const transferencias: Transferencia[] = []
  let i = 0
  let j = 0

  while (i < deudores.length && j < acreedores.length) {
    const debe = -deudores[i].balance
    const leDeben = acreedores[j].balance
    const monto = Math.round(Math.min(debe, leDeben) * 100) / 100

    if (monto > 0.005) {
      transferencias.push({ de: deudores[i].member_id, a: acreedores[j].member_id, monto })
      deudores[i].balance += monto
      acreedores[j].balance -= monto
    }

    if (Math.abs(deudores[i].balance) < 0.005) i++
    if (Math.abs(acreedores[j].balance) < 0.005) j++
  }

  return transferencias
}

/** Lo gastado por categoría en el espacio, para medir los presupuestos del grupo. */
export function gastoPorCategoria(gastos: GastoCompartido[]): Map<string, number> {
  const total = new Map<string, number>()
  for (const gasto of gastos) {
    if (!gasto.category_id) continue
    total.set(gasto.category_id, (total.get(gasto.category_id) ?? 0) + gasto.amount)
  }
  return total
}

// --- Carga -------------------------------------------------------------------

export async function cargarEspacios(supabase: SupabaseClient): Promise<{
  espacios: Espacio[]
  error: string | null
  faltaMigracion: boolean
}> {
  const { data: membresias, error: errorMiembros } = await supabase
    .from('shared_space_members')
    .select('space_id')

  if (errorMiembros) {
    const falta = faltaLaTabla(errorMiembros.code)
    return {
      espacios: [],
      error: falta ? FALTA_MIGRACION_COMPARTIDOS : errorMiembros.message,
      faltaMigracion: falta,
    }
  }

  const ids = (membresias ?? []).map((m) => m.space_id as string)
  if (ids.length === 0) return { espacios: [], error: null, faltaMigracion: false }

  const [{ data: espacios, error }, { data: todos }] = await Promise.all([
    supabase.from('shared_spaces').select('*').in('id', ids).order('created_at', { ascending: false }),
    supabase.from('shared_space_members').select('space_id').in('space_id', ids),
  ])

  if (error) return { espacios: [], error: error.message, faltaMigracion: false }

  const conteo = new Map<string, number>()
  for (const fila of todos ?? []) {
    const id = fila.space_id as string
    conteo.set(id, (conteo.get(id) ?? 0) + 1)
  }

  return {
    espacios: (espacios ?? []).map((e) => ({
      id: e.id as string,
      name: e.name as string,
      type: e.type as TipoDeEspacio,
      currency: e.currency as Moneda,
      created_by: e.created_by as string,
      miembros: conteo.get(e.id as string) ?? 1,
    })),
    error: null,
    faltaMigracion: false,
  }
}

export type BaseDelEspacio = {
  espacio: Espacio | null
  miembros: Miembro[]
  /** Generación vigente de la llave del grupo. Con qué se escribe de ahora en más. */
  generacion: number
  error: string | null
  faltaMigracion: boolean
}

/**
 * Lo del espacio que el servidor SÍ puede leer: quién está y cómo se llama.
 *
 * Va aparte de los gastos porque son dos preguntas con dos respuestas
 * distintas. Esto decide si mostrar la pantalla, mandar a "unirse" o cortar con
 * un 404 — todo antes de pintar nada. Los gastos no los puede leer el servidor
 * ni aunque quisiera, así que esperar por ellos acá sería esperar para siempre.
 */
export async function cargarBaseDelEspacio(
  supabase: SupabaseClient,
  spaceId: string
): Promise<BaseDelEspacio> {
  const vacio = { espacio: null, miembros: [], generacion: 1 }

  const { data: espacio, error } = await supabase
    .from('shared_spaces')
    .select('*')
    .eq('id', spaceId)
    .maybeSingle()

  if (error) {
    return {
      ...vacio,
      error: faltaLaTabla(error.code) ? FALTA_MIGRACION_COMPARTIDOS : error.message,
      faltaMigracion: faltaLaTabla(error.code),
    }
  }
  if (!espacio) return { ...vacio, error: null, faltaMigracion: false }

  const resMiembros = await supabase
    .from('shared_space_members')
    .select('id, user_id, role, display_name')
    .eq('space_id', spaceId)

  // Con la 011 pero sin la 015, `display_name` no existe y PostgREST responde
  // 42703. Se avisa cuál migración falta en vez de mostrar un espacio vacío
  // como si el grupo no tuviera nada.
  if (faltaLaColumna(resMiembros.error?.code)) {
    return { ...vacio, error: FALTA_MIGRACION_MIEMBROS, faltaMigracion: true }
  }
  if (resMiembros.error) {
    return { ...vacio, error: resMiembros.error.message, faltaMigracion: false }
  }

  const miembros = (resMiembros.data ?? []) as Miembro[]

  return {
    espacio: {
      id: espacio.id as string,
      name: espacio.name as string,
      type: espacio.type as TipoDeEspacio,
      currency: espacio.currency as Moneda,
      created_by: espacio.created_by as string,
      miembros: miembros.length,
    },
    miembros,
    generacion: Number(espacio.generacion ?? 1),
    error: null,
    faltaMigracion: false,
  }
}

/**
 * Las filas de los gastos, SIN interpretar.
 *
 * Devuelve lo que vino de PostgREST y nada más. Interpretar es descifrar, y
 * descifrar sólo puede pasar donde está la llave: en el navegador de un
 * miembro. Que esta función no sepa leer lo que trae no es una carencia — es la
 * propiedad que hace que el servidor tampoco pueda.
 *
 * Se piden las columnas en claro ADEMÁS del sobre porque los grupos que ya
 * tenían datos las siguen usando hasta que alguien con la llave los re-cifra.
 */
export async function cargarEspacioCrudo(
  supabase: SupabaseClient,
  spaceId: string
): Promise<{ crudo: EspacioCrudo; error: string | null; faltaMigracion: boolean }> {
  const vacio: EspacioCrudo = { gastos: [], liquidaciones: [], objetivos: [] }

  const [resGastos, resLiquidaciones, resObjetivos] = await Promise.all([
    supabase
      .from('shared_transactions')
      .select(
        'id, space_id, paid_by_member_id, payload_cifrado, generacion, category_id, category_name, category_icon, category_color, split_type, amount, description, date, shared_splits(member_id, percentage, amount_owed, is_settled)'
      )
      .eq('space_id', spaceId)
      .order('date', { ascending: false }),
    supabase
      .from('shared_settlements')
      .select(
        'id, from_member_id, to_member_id, payload_cifrado, generacion, amount, currency, note, created_at'
      )
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false }),
    supabase
      .from('shared_goals')
      .select(
        'id, title, type, payload_cifrado, generacion, category_id, category_name, category_icon, category_color, target_amount, monthly_contribution, target_date, currency'
      )
      .eq('space_id', spaceId)
      .order('created_at'),
  ])

  const falta =
    faltaLaColumna(resGastos.error?.code) ||
    faltaLaTabla(resLiquidaciones.error?.code) ||
    faltaLaTabla(resObjetivos.error?.code)

  if (falta) return { crudo: vacio, error: FALTA_MIGRACION_CIFRADOS, faltaMigracion: true }

  const primerError = resGastos.error ?? resLiquidaciones.error ?? resObjetivos.error
  if (primerError) return { crudo: vacio, error: primerError.message, faltaMigracion: false }

  return {
    crudo: {
      gastos: (resGastos.data ?? []) as EspacioCrudo['gastos'],
      liquidaciones: (resLiquidaciones.data ?? []) as EspacioCrudo['liquidaciones'],
      objetivos: (resObjetivos.data ?? []) as EspacioCrudo['objetivos'],
    },
    error: null,
    faltaMigracion: false,
  }
}
