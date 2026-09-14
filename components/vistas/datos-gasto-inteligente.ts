/**
 * Los datos de la pantalla, aparte de la pantalla.
 *
 * Vive fuera del modulo 'use client' a proposito: en un modulo cliente TODOS
 * los exports son referencias, y el servidor los puede renderizar pero no
 * llamar. Como esto lo llaman las DOS rutas —la del servidor y la del
 * navegador— dejarlo alla rompe la pantalla apenas el servidor lo usa.
 */

import type { Inversion, Tarjeta } from '@/lib/types'

export type DatosDelGastoInteligente = {
  tarjetas: Tarjeta[]
  deudaPorTarjeta: Record<string, number>
  /** Una TNA por moneda: las tasas de pesos y dolares no se mezclan. */
  tnaLiquida: Record<string, number | null>
  inversiones: Inversion[]
}

/**
 * La deuda de cada tarjeta sale de su saldo, que en tarjetas es NEGATIVO: ese
 * negativo es lo que se debe. El `Math.max(0, …)` cubre el caso de una tarjeta
 * con saldo a favor, que no es una deuda de cero pesos sino ninguna deuda.
 */
export function deudaPorTarjetaDe(
  cuentas: { id: string; type: string; balance: number }[]
): Record<string, number> {
  return Object.fromEntries(
    cuentas
      .filter((c) => c.type === 'CREDIT_CARD')
      .map((c) => [c.id, Math.max(0, -Number(c.balance ?? 0))])
  )
}
