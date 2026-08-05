import { calcularFinanciacion, type Recomendacion } from './card-optimizer'
import { TNA_POR_DEFECTO } from './investments-service'
import { hoyEnArgentina, type Moneda } from './types'

/**
 * Asistente de gasto inteligente.
 *
 * LA PREGUNTA
 *
 * "Me hacen 15 % de descuento pagando contado, o lo llevo en 6 cuotas sin
 * interés. ¿Qué conviene?" No se responde comparando los dos totales: son
 * plata en momentos distintos. Pagar en cuotas deja el capital rindiendo en el
 * money market, y con TNA de tres dígitos ese rendimiento suele superar al
 * descuento.
 *
 * CÓMO SE RESUELVE
 *
 * Todo se trae a valor presente al día de la compra, descontando a la tasa que
 * el usuario REALMENTE consigue con su plata líquida (T+0 y T+1). Gana la
 * opción con menor valor presente, y la diferencia es la ganancia real.
 *
 * Las dos entradas que hacen que esto no sea un ejercicio teórico:
 *
 *   · la TNA sale de `investments-service`, no de un supuesto;
 *   · las fechas de pago salen de la tarjeta que más financia, vía
 *     `card-optimizer`, así que el float es el que da la tarjeta de verdad.
 */

/** Tope de la búsqueda de la tasa de indiferencia. */
const TNA_MAXIMA = 1000

const MS_POR_DIA = 86_400_000

export type ParametrosDeGasto = {
  /** Precio de lista, sin descuento y sin recargo. */
  cashPrice: number
  /** Descuento por pagar contado, en porcentaje. 15 = 15 %. */
  cashDiscount?: number
  /** Cantidad de cuotas del plan financiado. 1 = un pago con tarjeta. */
  installments: number
  /** Valor de cada cuota. Si no viene, se asume sin interés: precio / cuotas. */
  installmentAmount?: number | null
  /** Día de la compra (YYYY-MM-DD). Por defecto, hoy en Argentina. */
  purchaseDate?: string
}

export type ContextoDeGasto = {
  /** TNA líquida del usuario, en porcentaje. */
  tnaLiquida: number
  /** Tarjeta que más financia, o null si no hay ninguna cargada. */
  tarjeta: Recomendacion | null
  moneda: Moneda
}

export type PagoProgramado = {
  /** 1..n */
  numero: number
  monto: number
  /** YYYY-MM-DD */
  fecha: string
  /** Días desde la compra. */
  dias: number
  /** Valor presente de este pago. */
  valorPresente: number
}

export type Dictamen = {
  ganador: 'CONTADO' | 'CUOTAS'
  moneda: Moneda
  /** Precio a pagar hoy si se elige contado (ya con el descuento aplicado). */
  precioContado: number
  /** Suma nominal de las cuotas, sin descontar. */
  totalEnCuotas: number
  /**
   * Valor presente de cada opción, al día de la compra.
   *
   * En la UI `vpCuotas` se presenta como "costo real neto": es lo mismo, pero
   * dicho sin jerga. Vale la identidad `totalEnCuotas − interesesGanados =
   * vpCuotas` **a nivel de centavos**, que es la única precisión que la UI
   * muestra. En binario la resta puede quedar a un ulp (1 − 0,97 da
   * 0,030000000000000027): no compares estos tres campos con `===`.
   */
  vpContado: number
  vpCuotas: number
  /**
   * Lo que rinde el capital mientras se va pagando el plan: la diferencia
   * entre lo que se desembolsa nominalmente y lo que eso cuesta en plata de
   * hoy. Es el ahorro de financiar, todavía sin compararlo con el contado.
   */
  interesesGanados: number
  /** Cuánto se gana eligiendo al ganador, en plata de hoy. Siempre >= 0. */
  ganancia: number
  /** La misma ganancia como porcentaje del precio de lista. */
  gananciaPorcentual: number
  /** Días entre la compra y el primer vencimiento. 0 si no hay tarjeta. */
  diasDeFloat: number
  /** Días hasta el último vencimiento: cuánto dura el plan completo. */
  diasDelPlan: number
  /** TNA usada para descontar. */
  tnaAplicada: number
  /** True si la TNA es el valor por defecto y no una calculada de la cartera. */
  tnaEsPorDefecto: boolean
  /**
   * TNA a la que las dos opciones empatan. Por encima conviene financiar.
   * 0 = las cuotas ganan incluso sin rendir nada.
   * null = el contado gana con cualquier tasa razonable.
   */
  tasaDeIndiferencia: number | null
  /** Recargo nominal de financiar respecto del contado con descuento. */
  recargoNominal: number
  tarjeta: Recomendacion | null
  cronograma: PagoProgramado[]
  /** Frase corta con el motivo del fallo. */
  sugerencia: string
}

function aISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / MS_POR_DIA)
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100
}

/** "2026-08-04" -> Date en UTC a medianoche, o null si no es una fecha ISO. */
function parsearISO(fecha: string): Date | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  if (!partes) return null

  const candidata = new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])))
  return Number.isNaN(candidata.getTime()) ? null : candidata
}

/**
 * Día de la compra. Solo importan los días, nunca la hora.
 *
 * Cae en hoy si la cadena no sirve: el `<input type="date">` de la UI devuelve
 * "" cuando se lo vacía, y sin este resguardo el NaN se propagaba a todo el
 * dictamen. `hoyEnArgentina()` siempre es ISO, así que el segundo intento no
 * puede fallar; el `?? new Date()` es solo para no dejar el tipo en null.
 */
function diaDeCompra(fecha: string | undefined): Date {
  return (fecha ? parsearISO(fecha) : null) ?? parsearISO(hoyEnArgentina()) ?? new Date()
}

/**
 * Misma fecha `meses` más adelante, acotada al último día real del mes: el 31
 * de enero + 1 mes es el 28 de febrero, no el 3 de marzo.
 */
function mesesDespues(fecha: Date, meses: number): Date {
  const anio = fecha.getUTCFullYear()
  const mes = fecha.getUTCMonth() + meses
  const dia = fecha.getUTCDate()
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()
  return new Date(Date.UTC(anio, mes, Math.min(dia, ultimoDia)))
}

/**
 * Factor de descuento a `dias` vista.
 *
 * Capitaliza diario porque así funciona un money market: la TNA se divide por
 * 365 y se reinvierte todos los días. Usar interés simple subestimaría el
 * rendimiento justo donde la decisión se define, en los plazos largos.
 */
function factorDeDescuento(tna: number, dias: number): number {
  const diaria = tna / 100 / 365
  return 1 / Math.pow(1 + diaria, dias)
}

function valorPresenteDe(
  pagos: { monto: number; dias: number }[],
  tna: number
): number {
  return pagos.reduce((suma, pago) => suma + pago.monto * factorDeDescuento(tna, pago.dias), 0)
}

/**
 * Fechas en que se paga cada cuota.
 *
 * Con tarjeta: la primera cae en el vencimiento del resumen donde entra la
 * compra (lo calcula `card-optimizer`), y las siguientes un mes después cada
 * una. Sin tarjeta no hay float: se asume un pago por mes desde la compra.
 */
function calcularVencimientos(
  compra: Date,
  cuotas: number,
  tarjeta: Recomendacion | null
): Date[] {
  const primera = tarjeta
    ? calcularFinanciacion(tarjeta.tarjeta.detalle, compra).fechaDeVencimiento
    : mesesDespues(compra, 1)

  return Array.from({ length: cuotas }, (_, i) => mesesDespues(primera, i))
}

/**
 * TNA a la que las dos opciones cuestan lo mismo.
 *
 * El valor presente de las cuotas baja de forma monótona con la tasa, así que
 * una bisección converge sin sobresaltos. 60 iteraciones sobre [0, 1000] dejan
 * un error muy por debajo del centésimo de punto.
 */
function buscarTasaDeIndiferencia(
  vpContado: number,
  pagos: { monto: number; dias: number }[]
): number | null {
  const diferencia = (tna: number) => vpContado - valorPresenteDe(pagos, tna)

  // Sin rendir nada las cuotas ya cuestan menos: convienen con cualquier tasa.
  if (diferencia(0) >= 0) return 0
  // Ni al tope el financiamiento alcanza al descuento.
  if (diferencia(TNA_MAXIMA) < 0) return null

  let bajo = 0
  let alto = TNA_MAXIMA
  for (let i = 0; i < 60; i++) {
    const medio = (bajo + alto) / 2
    if (diferencia(medio) < 0) bajo = medio
    else alto = medio
  }
  return Math.round(alto * 100) / 100
}

function describirFallo(
  ganador: 'CONTADO' | 'CUOTAS',
  tarjeta: Recomendacion | null,
  diasDeFloat: number
): string {
  if (ganador === 'CUOTAS') {
    return tarjeta
      ? `Financiá con ${tarjeta.tarjeta.name}: son ${diasDeFloat} días hasta el primer vencimiento y ese plazo lo cubre tu rendimiento.`
      : 'Conviene financiar: lo que rinde tu plata líquida supera al descuento. Cargá tus tarjetas para saber con cuál estirar más el pago.'
  }

  return 'Pagá contado: el descuento supera a lo que rendiría esa plata durante el plazo del plan.'
}

/**
 * Compara pagar contado con descuento contra financiar en cuotas.
 *
 * Función pura: el contexto (tasa y tarjeta) se inyecta, así el criterio se
 * puede verificar sin base de datos y la UI puede recalcular en cada tecla sin
 * ir al servidor. `cargarContextoDeGasto` es quien arma ese contexto.
 *
 * Devuelve `null` si los parámetros no describen una compra (precio o cuotas
 * inválidos): no hay nada que dictaminar.
 */
export function evaluateExpenseStrategy(
  {
    cashPrice,
    cashDiscount = 0,
    installments,
    installmentAmount = null,
    purchaseDate,
  }: ParametrosDeGasto,
  contexto?: Partial<ContextoDeGasto>
): Dictamen | null {
  if (!Number.isFinite(cashPrice) || cashPrice <= 0) return null
  if (!Number.isFinite(installments) || installments < 1) return null

  const cuotas = Math.floor(installments)
  const descuento = Number.isFinite(cashDiscount) ? Math.min(Math.max(cashDiscount, 0), 100) : 0

  // Sin inversiones cargadas se asume el 40 % TNA: es una referencia razonable
  // de money market en pesos y evita que el asistente no opine.
  const tnaEsPorDefecto = contexto?.tnaLiquida == null || !Number.isFinite(contexto.tnaLiquida)
  const tnaAplicada = tnaEsPorDefecto ? TNA_POR_DEFECTO : Math.max(contexto!.tnaLiquida!, 0)
  const tarjeta = contexto?.tarjeta ?? null
  const moneda = contexto?.moneda ?? 'ARS'

  // Sin valor de cuota informado, el plan es "sin interés": el precio dividido.
  const montoDeCuota =
    installmentAmount != null && Number.isFinite(installmentAmount) && installmentAmount > 0
      ? installmentAmount
      : cashPrice / cuotas

  const compra = diaDeCompra(purchaseDate)
  const vencimientos = calcularVencimientos(compra, cuotas, tarjeta)

  const pagos = vencimientos.map((fecha, i) => ({
    numero: i + 1,
    monto: montoDeCuota,
    fecha,
    dias: Math.max(0, diasEntre(compra, fecha)),
  }))

  const precioContado = cashPrice * (1 - descuento / 100)
  // El contado se paga hoy: su valor presente es él mismo.
  const vpContado = precioContado
  const vpCuotas = valorPresenteDe(pagos, tnaAplicada)

  const diferencia = vpContado - vpCuotas
  const ganador: 'CONTADO' | 'CUOTAS' = diferencia > 0 ? 'CUOTAS' : 'CONTADO'
  const diasDeFloat = pagos[0]?.dias ?? 0

  // Los intereses se derivan de los DOS valores ya redondeados y no de los
  // crudos: así la resta que muestra la UI (total − intereses = costo real)
  // cierra al centavo y no queda desprolija por un redondeo independiente.
  const totalEnCuotas = redondear(montoDeCuota * cuotas)
  const vpCuotasRedondeado = redondear(vpCuotas)

  return {
    ganador,
    moneda,
    precioContado: redondear(precioContado),
    totalEnCuotas,
    vpContado: redondear(vpContado),
    vpCuotas: vpCuotasRedondeado,
    interesesGanados: redondear(totalEnCuotas - vpCuotasRedondeado),
    ganancia: redondear(Math.abs(diferencia)),
    gananciaPorcentual: Math.round((Math.abs(diferencia) / cashPrice) * 1000) / 10,
    diasDeFloat,
    diasDelPlan: pagos[pagos.length - 1]?.dias ?? 0,
    tnaAplicada: Math.round(tnaAplicada * 100) / 100,
    tnaEsPorDefecto,
    tasaDeIndiferencia: buscarTasaDeIndiferencia(vpContado, pagos),
    recargoNominal: redondear(montoDeCuota * cuotas - precioContado),
    tarjeta,
    cronograma: pagos.map((pago) => ({
      numero: pago.numero,
      monto: redondear(pago.monto),
      fecha: aISO(pago.fecha),
      dias: pago.dias,
      valorPresente: redondear(pago.monto * factorDeDescuento(tnaAplicada, pago.dias)),
    })),
    sugerencia: describirFallo(ganador, tarjeta, diasDeFloat),
  }
}
