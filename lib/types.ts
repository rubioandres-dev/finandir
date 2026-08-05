export type TipoTransaccion = 'INCOME' | 'EXPENSE' | 'TRANSFER'
export type TipoCategoria = 'INCOME' | 'EXPENSE'

export type TipoDeCuenta = 'BANK' | 'WALLET' | 'CASH' | 'INVESTMENT' | 'CREDIT_CARD'

export const ETIQUETA_TIPO_CUENTA: Record<TipoDeCuenta, string> = {
  BANK: 'Banco',
  WALLET: 'Billetera',
  CASH: 'Efectivo',
  INVESTMENT: 'Inversión',
  CREDIT_CARD: 'Tarjeta de crédito',
}

export type Cuenta = {
  id: string
  user_id: string
  name: string
  type: TipoDeCuenta
  currency: string
  /** En tarjetas es negativo: ese negativo es la deuda acumulada. */
  balance: number
  /** Falso en tarjetas (pasivo) e inversiones: no cuentan como disponible. */
  is_liquid: boolean
  created_at: string
}

export type DetalleTarjeta = {
  account_id: string
  /** Día del mes en que cierra el resumen. */
  closing_day: number
  /** Día del mes en que vence el pago. */
  due_day: number
  credit_limit: number | null
  bank_name: string | null
  last_four_digits: string | null
}

/** Cuenta de tipo tarjeta con sus datos de cierre y vencimiento. */
export type Tarjeta = Cuenta & { detalle: DetalleTarjeta }

export type TipoDeDeuda = 'OWED_BY_ME' | 'OWED_TO_ME'

export const ETIQUETA_TIPO_DEUDA: Record<TipoDeDeuda, string> = {
  OWED_BY_ME: 'Debo',
  OWED_TO_ME: 'Me deben',
}

export type Deuda = {
  id: string
  user_id: string
  counterparty_name: string
  total_amount: number
  remaining_amount: number
  currency: Moneda
  type: TipoDeDeuda
  due_date: string | null
  is_settled: boolean
  description: string | null
  created_at: string
}

// --- Inversiones (migrations/006) -------------------------------------------

export type TipoDeActivo =
  | 'MONEY_MARKET'
  | 'FIXED_INCOME'
  | 'STOCKS_CEDEARS'
  | 'CRYPTO'
  | 'REAL_ESTATE'

export const ETIQUETA_TIPO_ACTIVO: Record<TipoDeActivo, string> = {
  MONEY_MARKET: 'Money market',
  FIXED_INCOME: 'Renta fija',
  STOCKS_CEDEARS: 'Acciones y CEDEARs',
  CRYPTO: 'Cripto',
  REAL_ESTATE: 'Inmuebles',
}

/**
 * Plazo de rescate. T0 se acredita el mismo día, T1 al hábil siguiente.
 * LOCKED es plata inmovilizada: un plazo fijo no financia una compra de hoy.
 */
export type PlazoDeLiquidez = 'T0' | 'T1' | 'T2' | 'LOCKED'

export const ETIQUETA_LIQUIDEZ: Record<PlazoDeLiquidez, string> = {
  T0: 'Inmediata (T+0)',
  T1: '24 h (T+1)',
  T2: '48 h (T+2)',
  LOCKED: 'Inmovilizada',
}

/** Plazos que sirven para cubrir un gasto: los que se rescatan a tiempo. */
export const PLAZOS_LIQUIDOS: PlazoDeLiquidez[] = ['T0', 'T1']

export type Inversion = {
  id: string
  user_id: string
  name: string
  asset_type: TipoDeActivo
  currency: string
  /** Lo que pusiste: el costo. */
  amount_invested: number
  /** Lo que vale hoy. Es el que manda para el patrimonio. */
  current_value: number
  /** Tasa nominal anual estimada, en porcentaje (40 = 40 % TNA). */
  expected_tna: number
  liquidity_term: PlazoDeLiquidez
  created_at: string
}

export type Categoria = {
  id: string
  user_id: string
  name: string
  type: TipoCategoria
  icon: string
  color: string
  /** @deprecated Reemplazado por la tabla `budgets` (presupuesto por moneda). */
  monthly_budget?: number | null
}

export type Transaccion = {
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  amount: number
  /** Moneda en la que se registró el movimiento. */
  currency: 'ARS' | 'USD'
  /** Equivalente en USD congelado al momento de guardar; null si no había cotización. */
  amount_usd: number | null
  type: TipoTransaccion
  description: string | null
  date: string
  created_at: string
  /** Número de cuota dentro del plan; null si es un pago único. */
  installment_current: number | null
  installment_total: number | null
  /** Primera cuota del plan; null en la primera. */
  parent_transaction_id: string | null
  /** Metadatos del plan, repetidos en cada cuota. Ver migrations/004. */
  has_interest: boolean
  cash_price: number | null
  total_financed_amount: number | null
  installment_amount: number | null
}

/** Lo que devuelve /api/ai-parse. */
export type MovimientoSugerido = {
  amount: number
  type: TipoTransaccion
  currency: 'ARS' | 'USD'
  category_suggested: string
  description: string
  date: string
  /** 1 = pago único. El importe es el TOTAL, que se reparte entre las cuotas. */
  installment_total: number
  /** Nombre de la cuenta que detectó la IA; se resuelve a un id en el cliente. */
  account_name?: string | null
}

/** Cuenta elegible como origen de un movimiento. */
export type CuentaElegible = {
  id: string
  name: string
  type: TipoDeCuenta
  currency: string
}

export const ETIQUETA_TIPO: Record<TipoTransaccion, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
  TRANSFER: 'Transferencia',
}

export type Moneda = 'ARS' | 'USD'

export const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
})

const formatoMonedaUsd = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

export function formatearMonto(valor: number, moneda: Moneda): string {
  return (moneda === 'USD' ? formatoMonedaUsd : formatoMoneda).format(valor)
}

/** Un movimiento expresado en las dos monedas; null = sin cotización. */
export type MontoBimoneda = { ars: number | null; usd: number | null }

export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'

/** Fecha de hoy (YYYY-MM-DD) en hora de Argentina; el server suele correr en UTC. */
export function hoyEnArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Primer y último día del mes actual, en formato YYYY-MM-DD. */
export function rangoDelMesActual(): { desde: string; hasta: string } {
  const hoy = hoyEnArgentina()
  const [anio, mes] = hoy.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  const mm = String(mes).padStart(2, '0')
  return {
    desde: `${anio}-${mm}-01`,
    hasta: `${anio}-${mm}-${String(ultimoDia).padStart(2, '0')}`,
  }
}

export type Periodo = 'mes' | 'mesAnterior' | 'anio'

export const ETIQUETA_PERIODO: Record<Periodo, string> = {
  mes: 'Este mes',
  mesAnterior: 'Mes anterior',
  anio: 'Año',
}

function ultimoDiaDe(anio: number, mes: number): string {
  const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dias).padStart(2, '0')}`
}

/** Rango YYYY-MM-DD de un período, relativo a hoy en Argentina. */
export function rangoDelPeriodo(periodo: Periodo): { desde: string; hasta: string } {
  const [anio, mes] = hoyEnArgentina().split('-').map(Number)

  if (periodo === 'anio') {
    return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` }
  }

  // En enero, el mes anterior es diciembre del año pasado.
  const esAnterior = periodo === 'mesAnterior'
  const mesObjetivo = esAnterior ? (mes === 1 ? 12 : mes - 1) : mes
  const anioObjetivo = esAnterior && mes === 1 ? anio - 1 : anio

  return {
    desde: `${anioObjetivo}-${String(mesObjetivo).padStart(2, '0')}-01`,
    hasta: ultimoDiaDe(anioObjetivo, mesObjetivo),
  }
}

/**
 * Fecha más temprana que necesita el dashboard: una sola query cubre los tres
 * períodos del gráfico (en enero, "mes anterior" cae fuera del año actual).
 */
export function inicioDeLaVentanaDeDatos(): string {
  const inicioAnio = rangoDelPeriodo('anio').desde
  const inicioMesAnterior = rangoDelPeriodo('mesAnterior').desde
  return inicioMesAnterior < inicioAnio ? inicioMesAnterior : inicioAnio
}

/** "2026-08-01" -> "1 de agosto" (sin pasar por Date, para no correr la zona horaria). */
export function formatearFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const nombreMes = new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(
    new Date(Date.UTC(anio, mes - 1, dia))
  )
  const esteAnio = Number(hoyEnArgentina().slice(0, 4))
  return anio === esteAnio ? `${dia} de ${nombreMes}` : `${dia} de ${nombreMes} ${anio}`
}
