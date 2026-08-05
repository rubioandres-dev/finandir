// Solo para el servidor: se usa desde Server Components y Server Actions.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Moneda } from './types'

/**
 * Gastos compartidos: espacios, repartos y saldos.
 *
 * EL MODELO EN UNA LÍNEA
 *
 * Cada gasto tiene UN pagador y N repartos. El pagador puso todo; cada
 * participante debe su parte. El balance de una persona es lo que puso menos
 * lo que le tocaba: positivo significa que le deben.
 */

export type TipoDeEspacio = 'CONVIVENCIA' | 'VIAJE' | 'EVENTO'

export type Espacio = {
  id: string
  name: string
  type: TipoDeEspacio
  currency: Moneda
  created_by: string
  miembros: number
}

export type Miembro = {
  user_id: string
  role: 'ADMIN' | 'MEMBER'
  alias: string | null
}

export type GastoCompartido = {
  id: string
  space_id: string
  paid_by: string
  amount: number
  description: string
  date: string
  repartos: { user_id: string; percentage: number; amount_owed: number; is_settled: boolean }[]
}

export const FALTA_MIGRACION_COMPARTIDOS =
  'Falta el esquema de gastos compartidos. Ejecutá migrations/011_shared_expenses_and_modules.sql.'

function faltaLaTabla(codigo?: string): boolean {
  return codigo === 'PGRST205' || codigo === 'PGRST204' || codigo === '42P01'
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
  porcentajes: { user_id: string; percentage: number }[]
): { user_id: string; percentage: number; amount_owed: number }[] {
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
    extra.set(candidato.user_id, 1)
    sobrantes--
  }

  return crudos.map((c) => ({
    user_id: c.user_id,
    percentage: c.percentage,
    amount_owed: (c.piso + (extra.get(c.user_id) ?? 0)) / 100,
  }))
}

// --- Saldos ------------------------------------------------------------------

export type Balance = { user_id: string; balance: number }

/** Lo que cada uno puso menos lo que le tocaba. Positivo = le deben. */
export function calcularBalances(gastos: GastoCompartido[], miembros: string[]): Balance[] {
  const saldo = new Map<string, number>(miembros.map((id) => [id, 0]))

  for (const gasto of gastos) {
    saldo.set(gasto.paid_by, (saldo.get(gasto.paid_by) ?? 0) + gasto.amount)
    for (const reparto of gasto.repartos) {
      saldo.set(reparto.user_id, (saldo.get(reparto.user_id) ?? 0) - reparto.amount_owed)
    }
  }

  return [...saldo].map(([user_id, balance]) => ({
    user_id,
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
 * algoritmo trabaja sobre los BALANCES NETOS: toma al que más debe y al que
 * más le deben y los cruza, repitiendo hasta que todos quedan en cero.
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
      transferencias.push({ de: deudores[i].user_id, a: acreedores[j].user_id, monto })
      deudores[i].balance += monto
      acreedores[j].balance -= monto
    }

    if (Math.abs(deudores[i].balance) < 0.005) i++
    if (Math.abs(acreedores[j].balance) < 0.005) j++
  }

  return transferencias
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
  error: string | null
}> {
  const { data: espacio, error } = await supabase
    .from('shared_spaces')
    .select('*')
    .eq('id', spaceId)
    .maybeSingle()

  if (error) {
    return {
      espacio: null,
      miembros: [],
      gastos: [],
      error: faltaLaTabla(error.code) ? FALTA_MIGRACION_COMPARTIDOS : error.message,
    }
  }
  if (!espacio) return { espacio: null, miembros: [], gastos: [], error: null }

  const [{ data: miembros }, { data: gastos }] = await Promise.all([
    supabase.from('shared_space_members').select('user_id, role, alias').eq('space_id', spaceId),
    supabase
      .from('shared_transactions')
      .select('id, space_id, paid_by, amount, description, date, shared_splits(*)')
      .eq('space_id', spaceId)
      .order('date', { ascending: false }),
  ])

  return {
    espacio: {
      id: espacio.id as string,
      name: espacio.name as string,
      type: espacio.type as TipoDeEspacio,
      currency: espacio.currency as Moneda,
      created_by: espacio.created_by as string,
      miembros: (miembros ?? []).length,
    },
    miembros: (miembros ?? []) as Miembro[],
    gastos: (gastos ?? []).map((g) => {
      const fila = g as Record<string, unknown>
      return {
        id: fila.id as string,
        space_id: fila.space_id as string,
        paid_by: fila.paid_by as string,
        amount: Number(fila.amount),
        description: fila.description as string,
        date: fila.date as string,
        repartos: ((fila.shared_splits ?? []) as Record<string, unknown>[]).map((s) => ({
          user_id: s.user_id as string,
          percentage: Number(s.percentage),
          amount_owed: Number(s.amount_owed),
          is_settled: Boolean(s.is_settled),
        })),
      }
    }),
    error: null,
  }
}
