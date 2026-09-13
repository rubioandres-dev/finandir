import { todosLosMovimientos } from './almacen/consultas'
import type { Libro } from './almacen/libro'
import { MONEDAS_POR_DEFECTO, normalizarMoneda } from './monedas'
import type { Moneda } from './types'

/** Una cuota futura, tal como se consulta para proyectar. */
export type CuotaFutura = {
  id: string
  date: string
  amount: number
  currency: Moneda
  description: string | null
  account_id: string
  installment_current: number
  installment_total: number
  parent_transaction_id: string | null
  has_interest: boolean
  cash_price: number | null
  total_financed_amount: number | null
}

export type PuntoDeCurva = {
  /**
   * YYYY-MM. Sin traducir a propósito: la etiqueta la arma quien dibuja, que
   * es el único que conoce la región del usuario. Antes salía de acá con los
   * meses en español cableados, así que un usuario en en-US veía "Sep 26"
   * escrito en castellano.
   */
  mes: string
  porMoneda: { moneda: Moneda; valor: number }[]
}

export type PlanActivo = {
  /** Id de la cuota madre, o de la primera conocida. */
  id: string
  descripcion: string
  moneda: Moneda
  cuentaId: string
  cuotaActual: number
  cuotasTotales: number
  montoDeCuota: number
  /** Lo que falta pagar. */
  restante: number
  totalDelPlan: number
  tieneInteres: boolean
  recargo: number
  proximoVencimiento: string | null
}

function sumarMesAlPeriodo(periodo: string, meses: number): string {
  const [anio, mes] = periodo.split('-').map(Number)
  const d = new Date(Date.UTC(anio, mes - 1 + meses, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Curva de desendeudamiento: cuánto hay que pagar en cuotas cada mes, desde
 * el mes actual hacia adelante.
 *
 * Función pura para poder verificarla sin base de datos.
 */
export function construirCurva(
  cuotas: CuotaFutura[],
  desdePeriodo: string,
  meses = 12
): PuntoDeCurva[] {
  const acumulado = new Map<string, Map<Moneda, number>>()
  // Arranca con el par por defecto para que la curva nunca quede sin series
  // cuando no hay cuotas; las divisas que aparezcan en los datos se suman.
  const monedasPresentes = new Set<Moneda>(MONEDAS_POR_DEFECTO)

  for (let i = 0; i < meses; i++) {
    acumulado.set(sumarMesAlPeriodo(desdePeriodo, i), new Map())
  }

  for (const cuota of cuotas) {
    const periodo = cuota.date.slice(0, 7)
    const bucket = acumulado.get(periodo)
    // Las cuotas fuera de la ventana no se dibujan, pero sí cuentan en el total.
    if (!bucket) continue
    const moneda = normalizarMoneda(cuota.currency)
    bucket.set(moneda, (bucket.get(moneda) ?? 0) + Number(cuota.amount))
    monedasPresentes.add(moneda)
  }

  // Todos los puntos de la curva tienen las mismas monedas, estén o no en cero:
  // el gráfico compara mes contra mes y un hueco cambiaría la escala.
  const monedas = [...monedasPresentes]

  return Array.from(acumulado, ([mes, porMonedaMap]) => ({
    mes,
    porMoneda: monedas.map((moneda) => ({
      moneda,
      valor: Math.round((porMonedaMap.get(moneda) ?? 0) * 100) / 100,
    })),
  }))
}

/** Agrupa las cuotas sueltas en planes, para la tabla de planes activos. */
export function agruparEnPlanes(
  cuotas: CuotaFutura[],
  todasLasDelPlan: CuotaFutura[],
  hoy: string
): PlanActivo[] {
  // La clave del plan es la madre; en la madre misma, su propio id.
  const claveDe = (c: CuotaFutura) => c.parent_transaction_id ?? c.id

  const porPlan = new Map<string, CuotaFutura[]>()
  for (const cuota of todasLasDelPlan) {
    const clave = claveDe(cuota)
    if (!porPlan.has(clave)) porPlan.set(clave, [])
    porPlan.get(clave)!.push(cuota)
  }

  const planes: PlanActivo[] = []

  for (const [clave, delPlan] of porPlan) {
    const pendientes = delPlan.filter((c) => c.date >= hoy)
    // Un plan sin cuotas por vencer ya está saldado.
    if (pendientes.length === 0) continue

    const ordenadas = [...delPlan].sort((a, b) => a.installment_current - b.installment_current)
    const referencia = ordenadas[0]
    const siguiente = [...pendientes].sort((a, b) => a.date.localeCompare(b.date))[0]

    const totalDelPlan =
      referencia.total_financed_amount !== null
        ? Number(referencia.total_financed_amount)
        : ordenadas.reduce((suma, c) => suma + Number(c.amount), 0)

    const contado = referencia.cash_price !== null ? Number(referencia.cash_price) : null

    planes.push({
      id: clave,
      descripcion: referencia.description ?? 'Plan de cuotas',
      moneda: (referencia.currency ?? 'ARS') as Moneda,
      cuentaId: referencia.account_id,
      // La cuota "actual" es la última ya vencida, o 0 si no arrancó.
      cuotaActual: delPlan.filter((c) => c.date < hoy).length,
      cuotasTotales: referencia.installment_total,
      montoDeCuota: Number(siguiente.amount),
      restante: Math.round(pendientes.reduce((s, c) => s + Number(c.amount), 0) * 100) / 100,
      totalDelPlan: Math.round(totalDelPlan * 100) / 100,
      tieneInteres: referencia.has_interest,
      recargo: contado !== null ? Math.round((totalDelPlan - contado) * 100) / 100 : 0,
      proximoVencimiento: siguiente.date,
    })
  }

  return planes.sort((a, b) => (a.proximoVencimiento ?? '').localeCompare(b.proximoVencimiento ?? ''))
}

/** Primer mes de la ventana sin ninguna cuota pendiente, como YYYY-MM. */
export function primerMesLibre(curva: PuntoDeCurva[]): string | null {
  const libre = curva.find((punto) => punto.porMoneda.every((m) => m.valor === 0))
  return libre?.mes ?? null
}

/**
 * Carga todas las cuotas de planes del usuario.
 *
 * Se traen TODAS (pasadas y futuras) porque la tabla de planes necesita saber
 * cuántas ya se pagaron para mostrar el progreso.
 */
export async function cargarCompromisos(
  libro: Libro,
  hoy: string
): Promise<{
  cuotas: CuotaFutura[]
  curva: PuntoDeCurva[]
  planes: PlanActivo[]
  error: string | null
}> {
  // Los planes pueden haber empezado hace anios y seguir vigentes, asi que esta
  // es de las pocas preguntas que necesitan la historia completa. Es cara y
  // esta bien que se note: quien la llame deberia saberlo.
  let data
  try {
    const todos = await todosLosMovimientos(libro)
    data = todos.filter((m) => m.installment_total !== null)
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error desconocido.'
    return {
      cuotas: [],
      curva: construirCurva([], hoy.slice(0, 7)),
      planes: [],
      error: mensaje.includes('42703')
        ? 'Faltan las columnas de intereses. Ejecutá migrations/004_installments_and_interest.sql.'
        : mensaje,
    }
  }

  const cuotas = (data ?? []) as CuotaFutura[]
  const futuras = cuotas.filter((c) => c.date >= hoy)

  return {
    cuotas,
    curva: construirCurva(futuras, hoy.slice(0, 7)),
    planes: agruparEnPlanes(futuras, cuotas, hoy),
    error: null,
  }
}
