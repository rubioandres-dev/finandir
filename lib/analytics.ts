import { rangoDelPeriodo, type Periodo } from './types'

export const COLOR_SIN_CATEGORIA = '#64748B'

export type GastoParaGrafico = {
  amount: number
  date: string
  category_id: string | null
  currency: 'ARS' | 'USD'
}

export type PorcionDeGasto = {
  nombre: string
  total: number
  color: string
  porcentaje: number
}

/**
 * Agrupa gastos por categoría dentro de un período y calcula el peso de cada
 * una sobre el total. Función pura: la UI solo la consume desde un useMemo.
 */
export function agruparGastosPorCategoria(
  gastos: GastoParaGrafico[],
  categorias: { id: string; name: string; color: string }[],
  periodo: Periodo,
  /** Solo se agregan gastos de esta moneda: pesos y dólares no se suman. */
  moneda: 'ARS' | 'USD'
): { porciones: PorcionDeGasto[]; total: number } {
  const { desde, hasta } = rangoDelPeriodo(periodo)
  const porId = new Map(categorias.map((c) => [c.id, c]))

  const acumulado = new Map<string, { total: number; color: string }>()
  let total = 0

  for (const gasto of gastos) {
    if (gasto.currency !== moneda) continue
    // Las fechas son YYYY-MM-DD: la comparación lexicográfica es cronológica.
    if (gasto.date < desde || gasto.date > hasta) continue

    const categoria = gasto.category_id ? porId.get(gasto.category_id) : undefined
    const nombre = categoria?.name ?? 'Sin categoría'
    const previo = acumulado.get(nombre)

    acumulado.set(nombre, {
      total: (previo?.total ?? 0) + Number(gasto.amount),
      color: previo?.color ?? categoria?.color ?? COLOR_SIN_CATEGORIA,
    })
    total += Number(gasto.amount)
  }

  const porciones = Array.from(acumulado, ([nombre, datos]) => ({
    nombre,
    total: datos.total,
    color: datos.color,
    porcentaje: total > 0 ? (datos.total / total) * 100 : 0,
  })).sort((a, b) => b.total - a.total)

  return { porciones, total }
}
