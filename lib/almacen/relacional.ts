/**
 * LIBRO RELACIONAL — el puente que evita el big bang
 * =============================================================================
 *
 * Implementa `Libro` leyendo las tablas de siempre. No es un backend nuevo: es
 * un andamio para poder portar las services UNA vez en vez de dos.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * Hoy el 100% de los usuarios está en modo relacional y el servidor les
 * renderiza el dashboard. En modo Bóveda el servidor NO puede leer nada, así
 * que el render tiene que irse al cliente. Si las services se portaran de una a
 * `Libro` sin esto, habría que mover todo el render el mismo día, para todos, y
 * rezar.
 *
 * Con este adaptador, cada service se escribe una sola vez contra `Libro` y
 * funciona en los dos mundos:
 *
 *     usuario relacional  ->  servidor  ->  crearLibroRelacional(supabase)
 *     usuario en Bóveda   ->  cliente   ->  crearLibro(cifrado(nube))
 *
 * Se borra el día que no quede nadie en modo relacional.
 *
 * ACÁ VIVEN LAS RAREZAS DE POSTGREST
 *
 * Los cuatro niveles de columnas según qué migración esté corrida, el join de
 * `credit_card_details`, `numeric` que vuelve como string. Todo eso era ruido
 * repartido por las services y ahora está en un solo lugar, que además tiene
 * fecha de vencimiento.
 *
 * LO QUE TODAVÍA NO IMPLEMENTA
 *
 * Sólo `perfil`, `cuentas` y `deudas`, que es lo que está portado. El resto
 * lanza con un mensaje que dice qué falta, en vez de devolver vacío y hacer que
 * la app muestre un dashboard en cero como si el usuario no tuviera nada.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizarModulos } from '../modules'
import type { PresupuestoDeCategoria } from '../category-budgets-service'
import type { Deuda, Transaccion } from '../types'
import type {
  CategoriaGuardada,
  Coleccion,
  CuentaGuardada,
  Manifiesto,
  NombreDeColeccion,
  PerfilGuardado,
} from './documentos'
import { manifiestoInicial } from './documentos'
import type { Libro } from './libro'

/** La tabla no existe: falta correr esa migración en el SQL Editor. */
export class FaltaMigracionRelacional extends Error {
  constructor(readonly migracion: string) {
    super(`Falta correr migrations/${migracion} en el SQL Editor de Supabase.`)
    this.name = 'FaltaMigracionRelacional'
  }
}

function esTablaFaltante(codigo?: string): boolean {
  return codigo === '42P01' || codigo === 'PGRST205' || codigo === 'PGRST204'
}

function esColumnaFaltante(codigo?: string): boolean {
  return codigo === '42703' || codigo === 'PGRST204'
}

/** `numeric` de PostgREST llega como string. */
function num(valor: unknown): number {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

function numONulo(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

type Fila = Record<string, unknown>

function noPortado(que: string): never {
  throw new Error(
    `El libro relacional todavía no sabe leer "${que}". Sigue saliendo de su ` +
      'service vieja hasta que se porte. Ver lib/almacen/relacional.ts.'
  )
}

/**
 * `userId` es opcional porque SOLO el perfil lo necesita: cuentas, deudas y
 * saldos ya vienen filtrados por la RLS. Las paginas que no leen el perfil no
 * tienen que ir a buscarlo, y las que si lo leen normalmente ya lo tienen a
 * mano. Si falta, se resuelve una sola vez contra la sesion.
 */
export function crearLibroRelacional(
  supabase: SupabaseClient,
  userId?: string
): Libro {
  let idPendiente: Promise<string> | null = null

  async function id(): Promise<string> {
    if (userId) return userId
    idPendiente ??= supabase.auth
      .getUser()
      .then(({ data }) => data.user?.id ?? '')
    const resuelto = await idPendiente
    if (!resuelto) throw new Error('No hay sesion: no se puede leer el perfil.')
    return resuelto
  }

  // --- perfil ----------------------------------------------------------------

  const BASE_PERFIL =
    'user_id, display_name, selected_currencies, onboarding_completed, updated_at'

  /**
   * Cada nivel agrega las columnas de una migración. Si PostgREST rechaza el
   * select porque falta una columna, se baja un escalón: el perfil se sigue
   * leyendo con las migraciones que SÍ están corridas y lo que falta cae a su
   * default, en vez de tumbar la app entera.
   */
  const NIVELES_DE_PERFIL = [
    `${BASE_PERFIL}, locale, language, aurem_xp, aurem_tier, active_modules, storage_backend`,
    `${BASE_PERFIL}, locale, language, aurem_xp, aurem_tier, active_modules`,
    `${BASE_PERFIL}, locale, language, aurem_xp, aurem_tier`,
    `${BASE_PERFIL}, locale`,
    BASE_PERFIL,
  ]

  async function leerPerfil(): Promise<PerfilGuardado> {
    let data: Fila | null = null
    let error: { code?: string; message: string } | null = null

    for (const columnas of NIVELES_DE_PERFIL) {
      const respuesta = await supabase
        .from('user_profiles')
        .select(columnas)
        .eq('user_id', await id())
        .maybeSingle()

      data = respuesta.data as Fila | null
      error = respuesta.error

      if (!error || !esColumnaFaltante(error.code)) break
    }

    if (error) {
      if (esTablaFaltante(error.code)) {
        throw new FaltaMigracionRelacional('007_user_profiles_and_currencies.sql')
      }
      throw new Error(error.message)
    }

    // Sin fila: el usuario existe pero nunca pasó por el onboarding. Es un
    // estado normal, no un error, y por eso devuelve un perfil en blanco.
    if (!data) return perfilEnBlanco(await id())

    return {
      active_modules: normalizarModulos(data.active_modules),
      user_id: data.user_id as string,
      display_name: (data.display_name as string | null) ?? null,
      selected_currencies: Array.isArray(data.selected_currencies)
        ? (data.selected_currencies as string[])
        : [],
      locale: (data.locale as string) ?? '',
      language: (data.language as string) ?? '',
      aurem_xp: num(data.aurem_xp),
      aurem_tier: (data.aurem_tier as string | null) ?? 'BRONZE',
      onboarding_completed: data.onboarding_completed === true,
      updated_at: (data.updated_at as string | null) ?? null,
    }
  }

  async function escribirPerfil(cambios: Partial<PerfilGuardado>): Promise<void> {
    const fila = { user_id: await id(), ...cambios }

    let { error } = await supabase
      .from('user_profiles')
      .upsert(fila, { onConflict: 'user_id' })

    // Igual que en la lectura: si falta una columna el upsert entero rebota. Se
    // reintenta sin las que dependen de migraciones nuevas, para no perder el
    // resto del cambio por culpa de una que todavía no existe.
    if (error && esColumnaFaltante(error.code)) {
      const {
        locale: _l,
        language: _i,
        aurem_xp: _x,
        aurem_tier: _t,
        ...resto
      } = fila as Record<string, unknown>
      void [_l, _i, _x, _t]

      if (Object.keys(resto).length > 1) {
        ;({ error } = await supabase
          .from('user_profiles')
          .upsert(resto, { onConflict: 'user_id' }))
      }
    }

    if (error) {
      if (esTablaFaltante(error.code)) {
        throw new FaltaMigracionRelacional('007_user_profiles_and_currencies.sql')
      }
      throw new Error(error.message)
    }
  }

  // --- cuentas y deudas ------------------------------------------------------

  /**
   * Las filas crudas de `accounts`, pedidas UNA sola vez por instancia.
   *
   * `leerCuentas()` y `saldos()` necesitan la misma tabla, y sin esto cada
   * pagina del dashboard haria dos consultas donde antes hacia una. El libro
   * vive lo que vive el request, asi que memoizar aca no puede devolver datos
   * viejos: es exactamente el mismo instante para los dos llamadores.
   */
  let cuentasCrudas: Promise<Fila[]> | null = null

  function pedirCuentas(): Promise<Fila[]> {
    // IIFE async y no `.then()`: el builder de supabase-js devuelve un
    // `PromiseLike`, que no es asignable a `Promise`.
    cuentasCrudas ??= (async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .order('created_at')
      if (error) throw new Error(error.message)
      return (data ?? []) as Fila[]
    })()
    return cuentasCrudas
  }

  async function leerCuentas(): Promise<CuentaGuardada[]> {
    const [filas, resDetalles] = await Promise.all([
      pedirCuentas(),
      supabase.from('credit_card_details').select('*'),
    ])

    // Un error en los detalles NO corta: sin la 003 no hay tarjetas, y una
    // cuenta sin detalle sigue siendo una cuenta válida.
    const detalles = (resDetalles.data ?? []) as Fila[]
    const porCuenta = new Map(detalles.map((d) => [d.account_id as string, d]))

    return filas.map((c) => {
      const detalle = porCuenta.get(c.id as string)
      return {
        id: c.id as string,
        user_id: c.user_id as string,
        name: c.name as string,
        type: (c.type as CuentaGuardada['type']) ?? 'BANK',
        currency: String(c.currency ?? 'ARS').trim(),
        is_liquid: c.is_liquid !== false,
        created_at: (c.created_at as string) ?? '',
        detalle: detalle
          ? {
              account_id: detalle.account_id as string,
              closing_day: num(detalle.closing_day),
              due_day: num(detalle.due_day),
              credit_limit: numONulo(detalle.credit_limit),
              bank_name: (detalle.bank_name as string | null) ?? null,
              last_four_digits: (detalle.last_four_digits as string | null) ?? null,
            }
          : null,
      }
    })
  }

  async function leerDeudas(): Promise<Deuda[]> {
    const { data, error } = await supabase
      .from('debts')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      if (esTablaFaltante(error.code)) return []
      throw new Error(error.message)
    }

    return ((data ?? []) as Fila[]).map((d) => ({
      id: d.id as string,
      user_id: d.user_id as string,
      counterparty_name: d.counterparty_name as string,
      total_amount: num(d.total_amount),
      remaining_amount: num(d.remaining_amount),
      currency: String(d.currency ?? 'ARS').trim(),
      type: d.type as Deuda['type'],
      due_date: (d.due_date as string | null) ?? null,
      is_settled: d.is_settled === true,
      description: (d.description as string | null) ?? null,
      created_at: (d.created_at as string) ?? '',
    }))
  }

  // --- categorias ------------------------------------------------------------

  async function leerCategorias(): Promise<CategoriaGuardada[]> {
    const [resCategorias, resPresupuestos] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('category_budgets').select('id, category_id, amount, currency'),
    ])

    if (resCategorias.error) throw new Error(resCategorias.error.message)

    // Sin la 013 no hay presupuestos, y una categoria sin presupuesto sigue
    // siendo una categoria: el error no corta.
    const porCategoria = new Map<string, PresupuestoDeCategoria[]>()
    for (const p of (resPresupuestos.data ?? []) as Fila[]) {
      const id = p.category_id as string
      porCategoria.set(id, [
        ...(porCategoria.get(id) ?? []),
        {
          id: p.id as string,
          category_id: id,
          amount: num(p.amount),
          currency: String(p.currency ?? 'ARS').trim(),
        },
      ])
    }

    return ((resCategorias.data ?? []) as Fila[]).map((c) => ({
      id: c.id as string,
      user_id: c.user_id as string,
      name: String(c.name),
      type: c.type as CategoriaGuardada['type'],
      icon: (c.icon as string) ?? 'circle',
      color: (c.color as string) ?? '#64748B',
      presupuestos: porCategoria.get(c.id as string) ?? [],
    }))
  }

  // --- movimientos -----------------------------------------------------------

  function aMovimiento(t: Fila): Transaccion {
    return {
      id: t.id as string,
      user_id: t.user_id as string,
      account_id: t.account_id as string,
      category_id: (t.category_id as string | null) ?? null,
      amount: num(t.amount),
      currency: String(t.currency ?? 'ARS').trim(),
      amount_usd: numONulo(t.amount_usd),
      type: t.type as Transaccion['type'],
      description: (t.description as string | null) ?? null,
      date: t.date as string,
      created_at: (t.created_at as string) ?? '',
      installment_current: numONulo(t.installment_current),
      installment_total: numONulo(t.installment_total),
      parent_transaction_id: (t.parent_transaction_id as string | null) ?? null,
      has_interest: t.has_interest === true,
      cash_price: numONulo(t.cash_price),
      total_financed_amount: numONulo(t.total_financed_amount),
      installment_amount: numONulo(t.installment_amount),
    }
  }

  // --- Escritura de colecciones chicas ---------------------------------------
  //
  // `mutar()` da la coleccion entera de vuelta, asi que hay que diferenciar
  // contra lo que habia para saber que insertar, actualizar y borrar. Para
  // movimientos eso seria inviable —por eso existen los metodos angostos—, pero
  // cuentas y categorias son decenas de filas: diferenciarlas es barato y
  // mantiene la interface chica.

  type ConId = { id: string }

  function diferenciar<T extends ConId>(antes: T[], despues: T[]) {
    const antesPorId = new Map(antes.map((x) => [x.id, x]))
    const despuesPorId = new Map(despues.map((x) => [x.id, x]))

    return {
      aEscribir: despues.filter((x) => {
        const previo = antesPorId.get(x.id)
        return !previo || JSON.stringify(previo) !== JSON.stringify(x)
      }),
      aBorrar: antes.filter((x) => !despuesPorId.has(x.id)).map((x) => x.id),
    }
  }

  async function escribirCuentas(
    antes: CuentaGuardada[],
    despues: CuentaGuardada[]
  ): Promise<void> {
    const { aEscribir, aBorrar } = diferenciar(antes, despues)

    if (aEscribir.length > 0) {
      // `detalle` no es una columna de `accounts`: viaja embebido en el modelo
      // de documentos y aca vuelve a su tabla.
      const filas = aEscribir.map(({ detalle: _d, ...cuenta }) => {
        void _d
        return { ...cuenta, user_id: cuenta.user_id || undefined }
      })

      const { error } = await supabase
        .from('accounts')
        .upsert(filas, { onConflict: 'id' })
      if (error) throw new Error(error.message)

      const detalles = aEscribir.map((c) => c.detalle).filter((d) => d !== null)
      if (detalles.length > 0) {
        // Despues de las cuentas: `credit_card_details.account_id` las
        // referencia, asi que al reves el insert rebota.
        const { error: errorDetalle } = await supabase
          .from('credit_card_details')
          .upsert(detalles, { onConflict: 'account_id' })
        if (errorDetalle) throw new Error(errorDetalle.message)
      }
    }

    if (aBorrar.length > 0) {
      // El detalle se va solo: la FK de `credit_card_details` cascadea.
      const { error } = await supabase.from('accounts').delete().in('id', aBorrar)
      if (error) throw new Error(error.message)
    }

    cuentasCrudas = null
  }

  async function escribirCategorias(
    antes: CategoriaGuardada[],
    despues: CategoriaGuardada[]
  ): Promise<void> {
    const { aEscribir, aBorrar } = diferenciar(antes, despues)

    if (aEscribir.length > 0) {
      const filas = aEscribir.map(({ presupuestos: _p, ...categoria }) => {
        void _p
        return categoria
      })
      const { error } = await supabase
        .from('categories')
        .upsert(filas, { onConflict: 'id' })
      if (error) throw new Error(error.message)

      const presupuestos = aEscribir.flatMap((c) => c.presupuestos)
      if (presupuestos.length > 0) {
        const { error: errorPres } = await supabase
          .from('category_budgets')
          .upsert(presupuestos, { onConflict: 'id' })
        if (errorPres) throw new Error(errorPres.message)
      }
    }

    if (aBorrar.length > 0) {
      const { error } = await supabase.from('categories').delete().in('id', aBorrar)
      if (error) throw new Error(error.message)
    }
  }

  return {
    tipo: 'relacional',

    async leer<C extends NombreDeColeccion>(coleccion: C): Promise<Coleccion[C]> {
      switch (coleccion) {
        case 'perfil':
          return (await leerPerfil()) as Coleccion[C]
        case 'cuentas':
          return (await leerCuentas()) as Coleccion[C]
        case 'categorias':
          return (await leerCategorias()) as Coleccion[C]
        case 'deudas':
          return (await leerDeudas()) as Coleccion[C]
        default:
          return noPortado(coleccion)
      }
    },

    async mutar<C extends NombreDeColeccion>(
      coleccion: C,
      cambio: (actual: Coleccion[C]) => Coleccion[C]
    ): Promise<void> {
      if (coleccion === 'cuentas') {
        const antes = await leerCuentas()
        await escribirCuentas(antes, cambio(antes as Coleccion[C]) as CuentaGuardada[])
        return
      }

      if (coleccion === 'categorias') {
        const antes = await leerCategorias()
        await escribirCategorias(antes, cambio(antes as Coleccion[C]) as CategoriaGuardada[])
        return
      }

      if (coleccion !== 'perfil') return noPortado(coleccion)

      // Sin bloqueo optimista, y no es un olvido: la tabla relacional no tiene
      // columna de versión. Lo que la protege es que el upsert manda SOLO los
      // campos que cambiaron, así que dos escrituras a campos distintos no se
      // pisan. Es más débil que el lazo de `crearLibro()` y es aceptable
      // porque este camino tiene fecha de vencimiento.
      const actual = (await leerPerfil()) as Coleccion[C]
      const siguiente = cambio(actual) as PerfilGuardado
      await escribirPerfil(soloLoQueCambio(actual as PerfilGuardado, siguiente))
    },

    /**
     * En relacional el saldo NO se deriva: lo mantiene el trigger
     * `apply_transaction_to_balance` y sale de la columna. Por eso `alDia` se
     * ignora — la columna sólo sabe del presente y no puede reconstruir el
     * saldo a una fecha pasada.
     */
    async saldos(): Promise<Record<string, number>> {
      const saldos: Record<string, number> = {}
      for (const fila of await pedirCuentas()) {
        saldos[fila.id as string] = num(fila.balance)
      }
      return saldos
    },

    async movimientos(desde: string, hasta: string): Promise<Transaccion[]> {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('date', desde)
        .lte('date', hasta)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw new Error(error.message)
      return ((data ?? []) as Fila[]).map(aMovimiento)
    },

    async movimiento(id: string): Promise<Transaccion | null> {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw new Error(error.message)
      return data ? aMovimiento(data as Fila) : null
    },

    async agregarMovimientos(movimientos: Transaccion[]): Promise<void> {
      if (movimientos.length === 0) return

      // `upsert` y no `insert` para que agregar sea idempotente igual que del
      // otro lado: un reintento no duplica un plan de cuotas.
      const { error } = await supabase
        .from('transactions')
        .upsert(movimientos, { onConflict: 'id' })

      if (error) throw new Error(error.message)
    },

    async editarMovimiento(movimiento: Transaccion): Promise<void> {
      // Un UPDATE cualquiera: en relacional cambiar el año de la fecha no mueve
      // nada de lugar. La mudanza de shard solo existe del lado de documentos.
      const { error } = await supabase
        .from('transactions')
        .update(movimiento)
        .eq('id', movimiento.id)

      if (error) throw new Error(error.message)
    },

    async borrarMovimiento(id: string): Promise<void> {
      // Las cuotas se van solas: `parent_transaction_id` tiene
      // `on delete cascade` desde la migracion 003. Del lado de documentos hay
      // que hacerlo a mano, y por eso el metodo existe en la interface.
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },

    /**
     * `mutarMovimientos` —la version ANCHA— sigue sin portarse, y es deliberado.
     *
     * `mutarMovimientos` recibe la coleccion entera y devuelve la coleccion
     * entera. Sobre una tabla relacional eso obliga a diferenciar contra lo que
     * habia para saber que insertar, actualizar y borrar: para un anio con
     * miles de filas, es bajarlas todas y subirlas todas por cada gasto nuevo.
     *
     * Las escrituras siguen yendo por su camino viejo hasta que se porten de
     * verdad, contra el almacen de documentos donde el modelo de "reemplazar la
     * coleccion" si es el natural.
     */
    mutarMovimientos(): Promise<void> {
      return noPortado('escritura de movimientos')
    },

    async aniosConMovimientos(): Promise<number[]> {
      // `min`/`max` y no un distinct: son dos filas en vez de una por anio, y
      // el rango completo es lo unico que necesita quien pregunta.
      const [masViejo, masNuevo] = await Promise.all([
        supabase.from('transactions').select('date').order('date').limit(1).maybeSingle(),
        supabase
          .from('transactions')
          .select('date')
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const desde = (masViejo.data as { date?: string } | null)?.date
      const hasta = (masNuevo.data as { date?: string } | null)?.date
      if (!desde || !hasta) return []

      const primero = Number(desde.slice(0, 4))
      const ultimo = Number(hasta.slice(0, 4))
      return Array.from({ length: ultimo - primero + 1 }, (_, i) => primero + i)
    },

    async manifiesto(): Promise<Manifiesto> {
      // No hay manifiesto en relacional: no hay shards ni esquema de documentos
      // que versionar. Se devuelve uno vacío para que quien lo consulte no
      // tenga que preguntar en qué modo está.
      return manifiestoInicial()
    },

    async mutarManifiesto(): Promise<void> {
      // Silencio deliberado: no hay dónde guardarlo y no hace falta.
    },

    async diferir(_operacion, _parametros, ejecutar): Promise<void> {
      // Sin diario: en relacional las cascadas las hace Postgres con sus FK, que
      // es justamente lo que el diario vino a reemplazar del otro lado.
      await ejecutar()
    },

    invalidar() {
      // No hay caché: cada lectura va a la base.
    },
  }
}

/** Perfil de alguien que existe pero nunca pasó por el onboarding. */
function perfilEnBlanco(userId: string): PerfilGuardado {
  return {
    active_modules: {},
    user_id: userId,
    display_name: null,
    selected_currencies: [],
    locale: '',
    language: '',
    aurem_xp: 0,
    aurem_tier: 'BRONZE',
    onboarding_completed: false,
    updated_at: null,
  }
}

/**
 * Los campos que la mutación tocó de verdad.
 *
 * El upsert relacional manda sólo esto y no el perfil entero: si mandara todo,
 * guardar el nombre pisaría el idioma que otra pestaña acaba de cambiar. En el
 * libro de documentos ese problema lo resuelve el bloqueo optimista; acá, la
 * escritura parcial.
 */
function soloLoQueCambio(
  antes: PerfilGuardado,
  despues: PerfilGuardado
): Partial<PerfilGuardado> {
  const cambios: Record<string, unknown> = {}

  for (const clave of Object.keys(despues) as (keyof PerfilGuardado)[]) {
    if (clave === 'user_id') continue
    if (JSON.stringify(antes[clave]) !== JSON.stringify(despues[clave])) {
      cambios[clave] = despues[clave]
    }
  }

  return cambios as Partial<PerfilGuardado>
}
