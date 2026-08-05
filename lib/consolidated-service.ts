import type { Patrimonio } from './accounts-service'
import type { ResumenDeInversiones } from './investments-service'
import type { Cotizacion } from './rates'
import type { Moneda } from './types'

/**
 * Vista consolidada: el ÚNICO lugar donde pesos y dólares se suman.
 *
 * En todo el resto de la app son libros paralelos, y con razón: un total
 * mezclado no representa nada estable cuando una de las dos monedas se
 * devalúa. Acá se suman a propósito, y por eso todo lo que sale de este módulo
 * viene marcado con la cotización que se usó y su fecha: es una foto a un tipo
 * de cambio, no un saldo contable.
 *
 * Se convierte SIEMPRE a USD y no a pesos. Es la unidad que no se mueve bajo
 * los pies: un patrimonio neto en pesos crece por inflación aunque no hayas
 * ahorrado un peso.
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
  /** El mismo neto llevado a USD al MEP del día. null sin cotización. */
  netoEnUsd: number | null
}

export type Consolidado = {
  ars: LadoDeLaMoneda
  usd: LadoDeLaMoneda
  /** Suma de los dos netos en USD. null si falta la cotización. */
  patrimonioUnificadoUsd: number | null
  /** El mismo total expresado en pesos, para leerlo en la moneda de todos los días. */
  patrimonioUnificadoArs: number | null
  /** Cotización usada, para poder mostrarla junto al número. */
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
  patrimonio: Patrimonio,
  inversiones: ResumenDeInversiones,
  cotizacion: Cotizacion | null
): LadoDeLaMoneda {
  const liquido = valorDe(patrimonio.liquido, moneda)
  // El valor de mercado de `investments`, no el saldo de las cuentas de tipo
  // INVESTMENT: es el dato que el usuario mantiene al día.
  const enInversiones = valorDe(inversiones.valorActual, moneda)
  const porCobrar = valorDe(patrimonio.porCobrar, moneda)
  const deudaTarjetas = valorDe(patrimonio.deudaTarjetas, moneda)
  const deudaPersonal = valorDe(patrimonio.deudaPersonal, moneda)

  const neto = liquido + enInversiones + porCobrar - deudaTarjetas - deudaPersonal

  // Los dólares ya están en dólares; los pesos se dividen por el MEP.
  const netoEnUsd =
    moneda === 'USD'
      ? redondear(neto)
      : cotizacion && cotizacion.venta > 0
        ? redondear(neto / cotizacion.venta)
        : null

  return {
    moneda,
    liquido: redondear(liquido),
    inversiones: redondear(enInversiones),
    porCobrar: redondear(porCobrar),
    deudaTarjetas: redondear(deudaTarjetas),
    deudaPersonal: redondear(deudaPersonal),
    neto: redondear(neto),
    netoEnUsd,
  }
}

/**
 * Unifica los dos libros. Función pura: se puede verificar sin base de datos.
 */
export function consolidar(
  patrimonio: Patrimonio,
  inversiones: ResumenDeInversiones,
  cotizacion: Cotizacion | null
): Consolidado {
  const ars = armarLado('ARS', patrimonio, inversiones, cotizacion)
  const usd = armarLado('USD', patrimonio, inversiones, cotizacion)

  // Si falta la cotización no se inventa un total: preferimos un dato ausente
  // a uno falso, igual que con `amount_usd` en los movimientos.
  const unificadoUsd =
    ars.netoEnUsd === null ? null : redondear(ars.netoEnUsd + usd.netoEnUsd!)

  return {
    ars,
    usd,
    patrimonioUnificadoUsd: unificadoUsd,
    patrimonioUnificadoArs:
      unificadoUsd === null || !cotizacion ? null : Math.round(unificadoUsd * cotizacion.venta),
    cotizacion,
  }
}
