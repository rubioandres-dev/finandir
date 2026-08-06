import type { Patrimonio } from './accounts-service'
import { convertir, type MapaDeCambio } from './exchange'
import type { ResumenDeInversiones } from './investments-service'
import type { TotalPorMoneda } from './monedas'
import type { Cotizacion } from './rates'
import type { Moneda } from './types'

/**
 * Las tres capas de la card de balance del Home.
 *
 * QUÉ CONFUNDÍA LA VISTA ANTERIOR
 *
 * "Balance total" mostraba `saldos`, que son los saldos de las cuentas de la
 * moneda activa. Ese número mezclaba dos cosas que no se pueden leer juntas:
 * plata que está disponible hoy y deuda de tarjeta que se paga en algún momento
 * del mes. Con una tarjeta cargada, el "balance" bajaba al comprar aunque la
 * plata siguiera en la cuenta, y con varias divisas no había un total: había
 * una lista de números que el ojo terminaba sumando aunque no fueran sumables.
 *
 * LAS TRES CAPAS
 *
 *   1. Patrimonio neto — todo, unificado a la divisa del header.
 *   2. Liquidez hoy    — lo que se puede gastar sin pedirle permiso a nadie.
 *   3. Tarjetas        — lo comprometido, que NO se resta de la liquidez.
 *   4. Inversiones     — patrimonio que no se rescata hoy.
 *
 * Liquidez y tarjetas van separadas a propósito. Restarlas daría un "disponible
 * real" que suena más prudente y es más falso: el consumo de tarjeta no sale de
 * la caja hasta el vencimiento, y presentarlo como si ya hubiera salido hace
 * que la gente crea que tiene menos de lo que tiene. La relación entre las dos
 * se comunica con el indicador ámbar, no fusionándolas.
 *
 * POR QUÉ LAS CUOTAS FUTURAS NO SE SUMAN A LA DEUDA DE TARJETA
 *
 * `apply_transaction_to_balance` (schema.sql) corre en el INSERT sin mirar la
 * fecha, y un plan en 12 cuotas inserta las 12 filas de una. O sea: el `balance`
 * de la tarjeta YA tiene adentro todas las cuotas futuras. La curva de
 * compromisos no es plata adicional, es el recorte de ese mismo saldo que vence
 * en los próximos días — por eso va como sublínea y no como sumando.
 */

/** Una magnitud, desagregada por divisa y unificada si se pudo. */
export type CapaDeBalance = {
  /**
   * Total en la divisa de expresión. `null` si alguna divisa con saldo no se
   * pudo cotizar: no se suma lo que se pudo y se ignora el resto.
   */
  total: number | null
  /** Lo mismo sin convertir, para poder mostrar de dónde sale. */
  porMoneda: { moneda: Moneda; valor: number }[]
}

export type ResumenDeBalance = {
  /** Divisa en la que se expresan los totales: la activa del header. */
  moneda: Moneda
  /** Liquidez + inversiones + por cobrar − tarjetas − deuda personal. */
  patrimonioNeto: number | null
  /** Cuentas, efectivo, billeteras y rescates T+0. */
  liquidez: CapaDeBalance
  /** Deuda de tarjetas, en positivo. Incluye las cuotas futuras ya insertadas. */
  tarjetas: CapaDeBalance
  /** El recorte de la deuda de tarjeta que vence de acá a fin de mes. */
  cuotasDelMes: CapaDeBalance
  /** Valor de mercado de lo que NO se rescata hoy: T+1, T+2, cripto, plazos fijos. */
  inversiones: CapaDeBalance
  /** Lo que te deben. */
  porCobrar: CapaDeBalance
  /** Deuda con personas, en positivo. */
  deudaPersonal: CapaDeBalance
  /** Divisas con saldo que no se pudieron cotizar. */
  sinCotizacion: Moneda[]
  /**
   * true cuando lo que vence este mes no entra en la liquidez de hoy.
   *
   * Se compara contra las cuotas del mes y no contra la deuda total de tarjeta:
   * el saldo entero incluye cuotas de dentro de un año, y pintar una alerta
   * porque no podés pagar hoy algo que vence en noviembre sería gritar por
   * nada.
   */
  alertaLiquidez: boolean
  /** Cotización usada, para poder mostrarla junto al número. */
  cotizacion: Cotizacion | null
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100
}

function valorDe(totales: TotalPorMoneda, moneda: Moneda): number {
  return totales.find((total) => total.moneda === moneda)?.valor ?? 0
}

/**
 * Lleva una magnitud desagregada a una sola divisa.
 *
 * Las divisas en cero no exigen cotización: una cuenta vacía en euros no puede
 * dejar sin total a alguien que sólo opera en pesos.
 */
function unificar(
  porMoneda: { moneda: Moneda; valor: number }[],
  destino: Moneda,
  mapa: MapaDeCambio,
  faltantes: Set<Moneda>
): CapaDeBalance {
  let total = 0
  let completo = true

  for (const { moneda, valor } of porMoneda) {
    if (valor === 0) continue

    const convertido = convertir(valor, moneda, destino, mapa)
    if (convertido === null) {
      faltantes.add(moneda)
      completo = false
      continue
    }
    total += convertido
  }

  return {
    total: completo ? redondear(total) : null,
    porMoneda: porMoneda.filter((linea) => linea.valor !== 0),
  }
}

/** Resta dos magnitudes desagregadas, balde por balde. */
function restar(
  a: TotalPorMoneda,
  b: TotalPorMoneda,
  monedas: Moneda[]
): { moneda: Moneda; valor: number }[] {
  return monedas.map((moneda) => ({
    moneda,
    valor: redondear(valorDe(a, moneda) - valorDe(b, moneda)),
  }))
}

function sumar(
  a: TotalPorMoneda,
  b: TotalPorMoneda,
  monedas: Moneda[]
): { moneda: Moneda; valor: number }[] {
  return monedas.map((moneda) => ({
    moneda,
    valor: redondear(valorDe(a, moneda) + valorDe(b, moneda)),
  }))
}

/**
 * Arma las tres capas. Función pura: se puede verificar sin base de datos.
 *
 * QUÉ DEFINICIÓN DE PATRIMONIO NETO USA
 *
 * La misma que `consolidated-service` y que la card de Cuentas: incluye lo que
 * te deben. El pedido original la definía sin ese término, pero dos pantallas
 * mostrando números distintos bajo el rótulo "patrimonio neto" es exactamente
 * la confusión que esta refactorización viene a sacar. "Me deben" se muestra
 * como línea propia, así que la fórmula se puede leer completa.
 *
 * `cuotasDelMes` viene de afuera (la curva de `commitments-service`) en vez de
 * calcularse acá: esta función es pura y no consulta nada.
 */
export function resumirBalance({
  patrimonio,
  inversiones,
  monedas,
  destino,
  mapa,
  cotizacion,
  cuotasDelMes = [],
}: {
  patrimonio: Patrimonio
  inversiones: ResumenDeInversiones
  /** Divisas a considerar. Se agregan las que aparezcan en los datos. */
  monedas: Moneda[]
  /** Divisa de expresión: la activa del header. */
  destino: Moneda
  mapa: MapaDeCambio
  cotizacion: Cotizacion | null
  /** Cuotas que vencen de hoy a fin de mes, por divisa. */
  cuotasDelMes?: { moneda: Moneda; valor: number }[]
}): ResumenDeBalance {
  // Los baldes reales pueden incluir divisas que están en los datos y no en el
  // perfil. Dejar plata afuera de la foto sería peor que mostrar una fila de más.
  const todas = [
    ...new Set<Moneda>([
      destino,
      ...monedas,
      ...patrimonio.liquido.map((l) => l.moneda),
      ...patrimonio.deudaTarjetas.map((l) => l.moneda),
      ...patrimonio.deudaPersonal.map((l) => l.moneda),
      ...patrimonio.porCobrar.map((l) => l.moneda),
      ...inversiones.valorActual.map((l) => l.moneda),
      ...cuotasDelMes.map((l) => l.moneda),
    ]),
  ]

  const faltantes = new Set<Moneda>()

  // Capa 2 · liquidez: lo de las cuentas líquidas más lo que se rescata HOY.
  // El T+0 es plata disponible aunque esté en un fondo, y dejarlo en la capa de
  // inversiones haría ver como ilíquido algo que se cobra en el día.
  const liquidez = unificar(
    sumar(patrimonio.liquido, inversiones.liquidezInmediata, todas),
    destino,
    mapa,
    faltantes
  )

  const tarjetas = unificar(
    todas.map((moneda) => ({ moneda, valor: valorDe(patrimonio.deudaTarjetas, moneda) })),
    destino,
    mapa,
    faltantes
  )

  const cuotas = unificar(
    todas.map((moneda) => ({
      moneda,
      valor: cuotasDelMes.find((c) => c.moneda === moneda)?.valor ?? 0,
    })),
    destino,
    mapa,
    faltantes
  )

  // Capa 3 · lo que NO se rescata hoy. Restar el T+0 evita contarlo dos veces:
  // ya está arriba, en liquidez.
  const inversionesNoInmediatas = unificar(
    restar(inversiones.valorActual, inversiones.liquidezInmediata, todas),
    destino,
    mapa,
    faltantes
  )

  const porCobrar = unificar(
    todas.map((moneda) => ({ moneda, valor: valorDe(patrimonio.porCobrar, moneda) })),
    destino,
    mapa,
    faltantes
  )

  const deudaPersonal = unificar(
    todas.map((moneda) => ({ moneda, valor: valorDe(patrimonio.deudaPersonal, moneda) })),
    destino,
    mapa,
    faltantes
  )

  // Capa 1 · el neto se arma por divisa y recién ahí se convierte. Convertir
  // cada término por separado y restar después daría el mismo número, pero
  // acumularía cinco redondeos por divisa en vez de uno.
  const netoPorMoneda = todas.map((moneda) => ({
    moneda,
    valor: redondear(
      valorDe(patrimonio.liquido, moneda) +
        valorDe(inversiones.valorActual, moneda) +
        valorDe(patrimonio.porCobrar, moneda) -
        valorDe(patrimonio.deudaTarjetas, moneda) -
        valorDe(patrimonio.deudaPersonal, moneda)
    ),
  }))

  const neto = unificar(netoPorMoneda, destino, mapa, faltantes)

  return {
    moneda: destino,
    patrimonioNeto: neto.total,
    liquidez,
    tarjetas,
    cuotasDelMes: cuotas,
    inversiones: inversionesNoInmediatas,
    porCobrar,
    deudaPersonal,
    sinCotizacion: [...faltantes],
    alertaLiquidez:
      liquidez.total !== null && cuotas.total !== null && cuotas.total > 0
        ? liquidez.total < cuotas.total
        : false,
    cotizacion,
  }
}
