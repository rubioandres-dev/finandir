import type { Cotizacion } from './rates'
import type { Moneda } from './types'

export const MONEDAS: Moneda[] = ['ARS', 'USD']

/** Total de una magnitud, desagregado por moneda. Nunca se suman entre sí. */
export type TotalPorMoneda = { moneda: Moneda; valor: number }[]

/**
 * Acumula importes agrupando por moneda.
 *
 * ARS y USD son libros paralelos: un total único que los mezcle no
 * representa nada, así que siempre se devuelve una entrada por moneda.
 */
export function totalizarPorMoneda(
  movimientos: { amount: number; currency?: Moneda | null }[]
): TotalPorMoneda {
  const acumulado = new Map<Moneda, number>(MONEDAS.map((m) => [m, 0]))

  for (const movimiento of movimientos) {
    // Las filas anteriores al multi-moneda no tienen currency: son pesos.
    const moneda = (movimiento.currency ?? 'ARS') as Moneda
    acumulado.set(moneda, (acumulado.get(moneda) ?? 0) + Number(movimiento.amount))
  }

  return MONEDAS.map((moneda) => ({
    moneda,
    valor: Math.round((acumulado.get(moneda) ?? 0) * 100) / 100,
  }))
}

/**
 * Equivalente aproximado en la otra moneda, solo para mostrar junto al ≈.
 * Nunca alimenta un total ni un saldo.
 */
export function equivalenteAproximado(
  valor: number,
  moneda: Moneda,
  cotizacion: Cotizacion | null
): { valor: number; moneda: Moneda } | null {
  if (!cotizacion || cotizacion.venta <= 0) return null

  return moneda === 'ARS'
    ? { valor: Math.round((valor / cotizacion.venta) * 100) / 100, moneda: 'USD' }
    : { valor: Math.round(valor * cotizacion.venta), moneda: 'ARS' }
}
