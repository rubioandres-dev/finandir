import type { Patrimonio } from './accounts-service'
import { convertir, type MapaDeCambio } from './exchange'
import type { ResumenDeInversiones } from './investments-service'
import type { Cotizacion } from './rates'
import type { Moneda } from './types'

/**
 * Vista consolidada: el ÚNICO lugar donde los libros se suman.
 *
 * En todo el resto de la app son paralelos, y con razón: un total mezclado no
 * representa nada estable cuando una de las monedas se devalúa. Acá se suman a
 * propósito, y por eso todo lo que sale de este módulo viene marcado con la
 * cotización que se usó y su fecha: es una foto a un tipo de cambio, no un
 * saldo contable.
 *
 * EN QUÉ MONEDA SE EXPRESA EL TOTAL
 *
 * Antes era siempre USD, con un argumento bueno: es la unidad que no se mueve
 * bajo los pies, y un patrimonio en pesos crece por inflación aunque no hayas
 * ahorrado un peso. Ahora es la DIVISA PRINCIPAL del usuario (la primera de su
 * lista), porque con divisas dinámicas no hay razón para asumir que el dólar
 * es la referencia de todo el mundo. Ese argumento sigue en pie: si elegís
 * pesos como principal, el total va a crecer con la inflación. Por eso la
 * vista muestra siempre la cotización usada y su fecha.
 */

export type LadoDeLaMoneda = {
  moneda: Moneda
  /** Efectivo, bancos y billeteras. */
  liquido: number
  /** Valor de mercado de la cartera de inversiones. */
  inversiones: number
  /** Lo que te deben. */
  porCobrar: number
  /** Deuda de tarjetas, en positivo. */
  deudaTarjetas: number
  /** Deuda con personas, en positivo. */
  deudaPersonal: number
  /** Líquido + inversiones + por cobrar − tarjetas − deuda personal. */
  neto: number
  /** El mismo neto llevado a la divisa principal. null si falta cotización. */
  netoEnPrincipal: number | null
  /** true si no hay nada cargado en esta moneda. */
  vacio: boolean
}

export type Consolidado = {
  /** Un lado por divisa, en el orden en que el usuario las eligió. */
  lados: LadoDeLaMoneda[]
  /** Divisa en la que se expresa el total: la primera de la lista. */
  principal: Moneda
  /** Suma de todos los netos, en la divisa principal. null si falta alguna cotización. */
  patrimonioUnificado: number | null
  /** Divisas que no se pudieron convertir por falta de cotización. */
  sinCotizacion: Moneda[]
  /** Cotización MEP usada, para poder mostrarla junto al número. */
  cotizacion: Cotizacion | null
}

function valorDe(totales: { moneda: Moneda; valor: number }[], moneda: Moneda): number {
  return totales.find((total) => total.moneda === moneda)?.valor ?? 0
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100
}

function armarLado(
  moneda: Moneda,
  principal: Moneda,
  patrimonio: Patrimonio,
  inversiones: ResumenDeInversiones,
  mapa: MapaDeCambio
): LadoDeLaMoneda {
  const liquido = valorDe(patrimonio.liquido, moneda)
  // El valor de mercado de `investments`, no el saldo de las cuentas de tipo
  // INVESTMENT: es el dato que el usuario mantiene al día.
  const enInversiones = valorDe(inversiones.valorActual, moneda)
  const porCobrar = valorDe(patrimonio.porCobrar, moneda)
  const deudaTarjetas = valorDe(patrimonio.deudaTarjetas, moneda)
  const deudaPersonal = valorDe(patrimonio.deudaPersonal, moneda)

  const neto = liquido + enInversiones + porCobrar - deudaTarjetas - deudaPersonal

  return {
    moneda,
    liquido: redondear(liquido),
    inversiones: redondear(enInversiones),
    porCobrar: redondear(porCobrar),
    deudaTarjetas: redondear(deudaTarjetas),
    deudaPersonal: redondear(deudaPersonal),
    neto: redondear(neto),
    netoEnPrincipal: convertir(neto, moneda, principal, mapa),
    vacio:
      liquido === 0 &&
      enInversiones === 0 &&
      porCobrar === 0 &&
      deudaTarjetas === 0 &&
      deudaPersonal === 0,
  }
}

/**
 * Unifica los libros. Función pura: se puede verificar sin base de datos.
 *
 * Si falta la cotización de UNA sola divisa con saldo, el total unificado
 * queda en `null`. No se suma lo que se pudo y se ignora el resto: un
 * patrimonio al que le falta un pedazo, mostrado como si estuviera completo,
 * es peor que no mostrar ninguno. Las que faltan salen en `sinCotizacion`
 * para poder decir cuáles son.
 */
export function consolidar(
  patrimonio: Patrimonio,
  inversiones: ResumenDeInversiones,
  monedas: Moneda[],
  mapa: MapaDeCambio,
  cotizacion: Cotizacion | null
): Consolidado {
  const principal = monedas[0] ?? 'ARS'
  const lados = monedas.map((moneda) =>
    armarLado(moneda, principal, patrimonio, inversiones, mapa)
  )

  const sinCotizacion = lados
    .filter((lado) => lado.netoEnPrincipal === null && !lado.vacio)
    .map((lado) => lado.moneda)

  const patrimonioUnificado =
    sinCotizacion.length > 0
      ? null
      : redondear(lados.reduce((total, lado) => total + (lado.netoEnPrincipal ?? 0), 0))

  return { lados, principal, patrimonioUnificado, sinCotizacion, cotizacion }
}
