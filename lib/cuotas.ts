/**
 * Aritmética de planes de cuotas.
 *
 * Vive fuera de actions.ts porque en un archivo 'use server' todo lo exportado
 * tiene que ser una función async, y además así se puede verificar sin
 * levantar el servidor.
 */

/**
 * Reparte un total en N cuotas iguales dejando el redondeo en la última, para
 * que la suma dé exactamente el total (y no 999,99 por arrastre de centavos).
 */
export function repartirEnCuotas(total: number, cuotas: number): number[] {
  if (cuotas <= 1) return [Math.round(total * 100) / 100]

  const base = Math.floor((total / cuotas) * 100) / 100
  const montos = Array.from({ length: cuotas - 1 }, () => base)
  const ultima = Math.round((total - base * (cuotas - 1)) * 100) / 100
  return [...montos, ultima]
}

/**
 * Suma meses a una fecha YYYY-MM-DD recortando al último día real del mes:
 * el 31 de enero + 1 mes es el 28 de febrero, no el 3 de marzo.
 */
export function sumarMeses(fecha: string, meses: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const destino = new Date(Date.UTC(anio, mes - 1 + meses, 1))
  const ultimoDia = new Date(
    Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)
  ).getUTCDate()

  const anioFinal = destino.getUTCFullYear()
  const mesFinal = String(destino.getUTCMonth() + 1).padStart(2, '0')
  const diaFinal = String(Math.min(dia, ultimoDia)).padStart(2, '0')
  return `${anioFinal}-${mesFinal}-${diaFinal}`
}

const aCentavos = (valor: number) => Math.round(valor * 100) / 100

/**
 * Lo que el usuario informa de un plan. Las tres magnitudes son opcionales
 * porque en la práctica se conoce una u otra según dónde se mire:
 * el comercio publica la cuota, el resumen publica el total.
 */
export type DatosDelPlan = {
  /** Cuotas del plan. 1 = pago único. */
  cuotas: number
  /** Precio de contado, si se conoce. */
  precioContado?: number | null
  /** Total a pagar financiado, si se conoce. */
  totalFinanciado?: number | null
  /** Valor de cada cuota, si se conoce. */
  montoDeCuota?: number | null
}

export type PlanResuelto = {
  cuotas: number
  /** Base efectiva del reparto: lo que realmente se va a pagar. */
  totalAPagar: number
  precioContado: number | null
  /** Diferencia entre lo financiado y el contado. 0 si no hay recargo. */
  recargo: number
  /** Porcentaje de recargo sobre el contado. null si no hay contado informado. */
  recargoPorcentual: number | null
  tieneInteres: boolean
  /** Importe de cada cuota; la última absorbe el redondeo. */
  montos: number[]
}

/**
 * Resuelve un plan de cuotas a partir de lo que se conozca.
 *
 * Precedencia de la base a repartir:
 *   1. totalFinanciado, si vino explícito
 *   2. montoDeCuota × cuotas, si se informó la cuota
 *   3. precioContado (plan sin recargo)
 *
 * Devuelve siempre montos que suman exactamente `totalAPagar`.
 */
export function resolverPlan({
  cuotas,
  precioContado = null,
  totalFinanciado = null,
  montoDeCuota = null,
}: DatosDelPlan): PlanResuelto {
  const n = Math.max(1, Math.floor(cuotas))

  const contado =
    precioContado !== null && Number.isFinite(precioContado) ? aCentavos(precioContado) : null

  // La cuota informada manda sobre el contado, pero no sobre el total explícito:
  // "12 cuotas de 50.000" es más preciso que un contado de referencia.
  const desdeCuota =
    montoDeCuota !== null && Number.isFinite(montoDeCuota) ? aCentavos(montoDeCuota * n) : null

  const total =
    totalFinanciado !== null && Number.isFinite(totalFinanciado)
      ? aCentavos(totalFinanciado)
      : (desdeCuota ?? contado ?? 0)

  // Sin contado no hay con qué comparar: se asume que no hay recargo informado.
  const recargo = contado !== null ? aCentavos(Math.max(0, total - contado)) : 0

  return {
    cuotas: n,
    totalAPagar: total,
    precioContado: contado,
    recargo,
    recargoPorcentual:
      contado !== null && contado > 0 ? Math.round((recargo / contado) * 1000) / 10 : null,
    tieneInteres: recargo > 0,
    montos: repartirEnCuotas(total, n),
  }
}

/** Valor de cada cuota de un plan ya resuelto, para mostrarlo en la UI. */
export function cuotaRepresentativa(plan: PlanResuelto): number {
  return plan.montos[0] ?? 0
}
