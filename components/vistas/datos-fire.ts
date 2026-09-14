/**
 * Los datos de la pantalla, aparte de la pantalla.
 *
 * Vive fuera del modulo 'use client' a proposito: en un modulo cliente TODOS
 * los exports son referencias, y el servidor los puede renderizar pero no
 * llamar. Como esto lo llaman las DOS rutas —la del servidor y la del
 * navegador— dejarlo alla rompe la pantalla apenas el servidor lo usa.
 */

import { totalizarPorMoneda } from '@/lib/monedas'
import { rangoDelPeriodo, type Moneda } from '@/lib/types'
import type { TotalPorMoneda } from '@/lib/monedas'

/** Tasa de retiro seguro de la regla del 4%, como en el tablero original. */
export const TASA_RETIRO_SEGURO = 0.04

export type DatosDeFire = {
  gastoDelMes: TotalPorMoneda
  promedioMensual: TotalPorMoneda
  capitalObjetivo: TotalPorMoneda
  mesesConDatos: number
}

/**
 * La cuenta entera, pura y compartida por las dos rutas.
 *
 * Vivía suelta en el `page.tsx`. Sacarla no es prolijidad: si cada ruta hiciera
 * su propia versión, el capital objetivo podría dar distinto según el modo de
 * guardado del usuario, que es la clase de bug que nadie mira dos veces.
 */
export function calcularFire(
  delMes: { type: string; currency?: string | null; amount: number; date: string }[],
  ventana: { type: string; currency?: string | null; amount: number; date: string }[],
  monedas: Moneda[]
): DatosDeFire {
  const gastoDelMes = totalizarPorMoneda(
    delMes.filter((t) => t.type === 'EXPENSE'),
    monedas
  )

  // Promedio mensual del año en curso: base menos ruidosa que un solo mes.
  const { desde: inicioAnio } = rangoDelPeriodo('anio')
  const gastosDelAnio = ventana.filter((t) => t.type === 'EXPENSE' && t.date >= inicioAnio)
  const mesesConDatos = new Set(gastosDelAnio.map((t) => t.date.slice(0, 7))).size || 1

  const promedioMensual = totalizarPorMoneda(gastosDelAnio, monedas).map((total) => ({
    ...total,
    valor: Math.round((total.valor / mesesConDatos) * 100) / 100,
  }))

  return {
    gastoDelMes,
    promedioMensual,
    // Capital objetivo = gasto anual / 4%, calculado por moneda por separado.
    capitalObjetivo: promedioMensual.map((total) => ({
      ...total,
      valor: Math.round((total.valor * 12) / TASA_RETIRO_SEGURO),
    })),
    mesesConDatos,
  }
}
