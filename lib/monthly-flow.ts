import type { SupabaseClient } from '@supabase/supabase-js'
import { esDeLaMoneda } from './currency-mode'
import type { Moneda } from './types'

/**
 * Ingresos contra gastos, mes a mes.
 *
 * POR QUÉ NO REUSA LA VENTANA DE `cargarDatosDelDashboard`
 *
 * Esa ventana arranca en el 1° de enero o en el mes anterior, lo que caiga
 * antes (`inicioDeLaVentanaDeDatos`). En agosto son ocho meses, en febrero son
 * dos: sirve para el selector "mes / mes anterior / año" del gráfico de
 * categorías, pero no para una serie de doce que tiene que cruzar el cambio de
 * año. Ampliar aquella ventana habría hecho más pesadas todas las vistas que la
 * usan para otra cosa, así que esto va por su propia consulta.
 *
 * UNA SOLA MONEDA
 *
 * La serie se calcula sobre la divisa activa del header. Un gráfico que sume
 * pesos con dólares dibuja una montaña que no existe, y convertir cada mes a la
 * cotización de HOY reescribiría el pasado cada vez que se mueve el dólar.
 */

export type PuntoMensual = {
  /** YYYY-MM. La etiqueta la arma quien dibuja, que conoce la región. */
  mes: string
  ingresos: number
  gastos: number
  /** Ingresos − gastos. Negativo cuando el mes cerró en rojo. */
  neto: number
}

type MovimientoDelFlujo = {
  amount: number | string
  currency: string | null
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  date: string
}

/** Corre el período YYYY-MM la cantidad de meses indicada. */
function correrPeriodo(periodo: string, meses: number): string {
  const [anio, mes] = periodo.split('-').map(Number)
  const d = new Date(Date.UTC(anio, mes - 1 + meses, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100
}

/**
 * Arma la serie. Función pura: se puede verificar sin base de datos.
 *
 * Los meses sin movimientos salen igual, en cero. Saltearlos comprimiría el eje
 * y haría ver dos meses consecutivos donde hubo un hueco de cuatro.
 *
 * Las TRANSFERENCIAS quedan afuera: mover plata de una cuenta a otra no es ni
 * un ingreso ni un gasto, y contarlas infla las dos barras a la vez.
 */
export function construirFlujoMensual(
  movimientos: MovimientoDelFlujo[],
  hastaPeriodo: string,
  meses = 12
): PuntoMensual[] {
  const acumulado = new Map<string, { ingresos: number; gastos: number }>()

  // Del más viejo al más nuevo, para que el eje se lea de izquierda a derecha.
  for (let i = meses - 1; i >= 0; i--) {
    acumulado.set(correrPeriodo(hastaPeriodo, -i), { ingresos: 0, gastos: 0 })
  }

  for (const movimiento of movimientos) {
    if (movimiento.type === 'TRANSFER') continue

    const periodo = movimiento.date.slice(0, 7)
    const balde = acumulado.get(periodo)
    if (!balde) continue

    const importe = Number(movimiento.amount)
    if (!Number.isFinite(importe)) continue

    if (movimiento.type === 'INCOME') balde.ingresos += importe
    else balde.gastos += importe
  }

  return [...acumulado].map(([mes, { ingresos, gastos }]) => ({
    mes,
    ingresos: redondear(ingresos),
    gastos: redondear(gastos),
    neto: redondear(ingresos - gastos),
  }))
}

/**
 * Carga los doce meses que terminan en el mes de `hoy`.
 *
 * Nunca lanza: si la consulta falla, la serie sale en cero y el gráfico se
 * dibuja vacío. Un error de esta sección no puede tumbar el Home entero.
 */
export async function cargarFlujoMensual(
  supabase: SupabaseClient,
  moneda: Moneda,
  hoy: string,
  meses = 12
): Promise<{ serie: PuntoMensual[]; error: string | null }> {
  const hastaPeriodo = hoy.slice(0, 7)
  const desde = `${correrPeriodo(hastaPeriodo, -(meses - 1))}-01`

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, currency, type, date')
    .gte('date', desde)
    .lte('date', hoy)

  if (error) {
    console.error('[monthly-flow]', error.message)
    return { serie: construirFlujoMensual([], hastaPeriodo, meses), error: error.message }
  }

  const movimientos = (data ?? []).filter((fila) =>
    esDeLaMoneda(fila as { currency?: string | null }, moneda)
  ) as MovimientoDelFlujo[]

  return { serie: construirFlujoMensual(movimientos, hastaPeriodo, meses), error: null }
}
