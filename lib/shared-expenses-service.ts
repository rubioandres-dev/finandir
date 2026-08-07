// Solo para el servidor: se usa desde Server Components y Server Actions.
import type { SupabaseClient } from '@supabase/supabase-js'
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

export type GastoCompartido = {
  id: string
  space_id: string
  paid_by_member_id: string
  category_id: string | null
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
  target_amount: number
  monthly_contribution: number | null
  target_date: string | null
  currency: Moneda
}

export const FALTA_MIGRACION_COMPARTIDOS =
  'Falta el esquema de gastos compartidos. Ejecutá migrations/011_shared_expenses_and_modules.sql.'

export const FALTA_MIGRACION_MIEMBROS =
  'Falta actualizar gastos compartidos. Ejecutá migrations/015_shared_members_and_settlements.sql en el SQL Editor de Supabase.'

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

export async function cargarEspacio(
  supabase: SupabaseClient,
  spaceId: string
): Promise<{
  espacio: Espacio | null
  miembros: Miembro[]
  gastos: GastoCompartido[]
  liquidaciones: Liquidacion[]
  objetivos: ObjetivoDeGrupo[]
  error: string | null
  faltaMigracion: boolean
}> {
  const vacio = {
    espacio: null,
    miembros: [],
    gastos: [],
    liquidaciones: [],
    objetivos: [],
  }

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

  const [resMiembros, resGastos, resLiquidaciones, resObjetivos] = await Promise.all([
    supabase
      .from('shared_space_members')
      .select('id, user_id, role, display_name')
      .eq('space_id', spaceId),
    supabase
      .from('shared_transactions')
      .select(
        'id, space_id, paid_by_member_id, category_id, split_type, amount, description, date, shared_splits(member_id, percentage, amount_owed, is_settled)'
      )
      .eq('space_id', spaceId)
      .order('date', { ascending: false }),
    supabase
      .from('shared_settlements')
      .select('id, from_member_id, to_member_id, amount, currency, note, created_at')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false }),
    supabase
      .from('shared_goals')
      .select(
        'id, title, type, category_id, target_amount, monthly_contribution, target_date, currency'
      )
      .eq('space_id', spaceId)
      .order('created_at'),
  ])

  // Con la 011 pero sin la 015, `display_name` y `paid_by_member_id` no existen
  // y PostgREST responde 42703. Se avisa cuál migración falta en vez de mostrar
  // un espacio vacío como si el grupo no tuviera nada.
  const faltaLa015 =
    faltaLaColumna(resMiembros.error?.code) ||
    faltaLaColumna(resGastos.error?.code) ||
    faltaLaTabla(resLiquidaciones.error?.code) ||
    faltaLaTabla(resObjetivos.error?.code)

  if (faltaLa015) {
    return { ...vacio, error: FALTA_MIGRACION_MIEMBROS, faltaMigracion: true }
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
    gastos: (resGastos.data ?? []).map((g) => {
      const fila = g as Record<string, unknown>
      return {
        id: fila.id as string,
        space_id: fila.space_id as string,
        paid_by_member_id: fila.paid_by_member_id as string,
        category_id: (fila.category_id as string | null) ?? null,
        split_type: (fila.split_type as TipoDeReparto) ?? 'EQUAL',
        amount: Number(fila.amount),
        description: fila.description as string,
        date: fila.date as string,
        repartos: ((fila.shared_splits ?? []) as Record<string, unknown>[]).map((s) => ({
          member_id: s.member_id as string,
          percentage: Number(s.percentage),
          amount_owed: Number(s.amount_owed),
          is_settled: Boolean(s.is_settled),
        })),
      }
    }),
    liquidaciones: (resLiquidaciones.data ?? []).map((l) => {
      const fila = l as Record<string, unknown>
      return {
        id: fila.id as string,
        from_member_id: fila.from_member_id as string,
        to_member_id: fila.to_member_id as string,
        amount: Number(fila.amount),
        currency: fila.currency as Moneda,
        note: (fila.note as string | null) ?? null,
        created_at: fila.created_at as string,
      }
    }),
    objetivos: (resObjetivos.data ?? []).map((o) => {
      const fila = o as Record<string, unknown>
      return {
        id: fila.id as string,
        title: fila.title as string,
        type: fila.type as ObjetivoDeGrupo['type'],
        category_id: (fila.category_id as string | null) ?? null,
        target_amount: Number(fila.target_amount),
        monthly_contribution:
          fila.monthly_contribution === null ? null : Number(fila.monthly_contribution),
        target_date: (fila.target_date as string | null) ?? null,
        currency: fila.currency as Moneda,
      }
    }),
    error: null,
    faltaMigracion: false,
  }
}
