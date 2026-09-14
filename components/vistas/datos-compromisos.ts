/**
 * Los datos de la pantalla, aparte de la pantalla.
 *
 * Vive fuera del modulo 'use client' a proposito: en un modulo cliente TODOS
 * los exports son referencias, y el servidor los puede renderizar pero no
 * llamar. Como esto lo llaman las DOS rutas —la del servidor y la del
 * navegador— dejarlo alla rompe la pantalla apenas el servidor lo usa.
 */

import { cargarCompromisos } from '@/lib/commitments-service'
import type { PlanActivo, PuntoDeCurva } from '@/lib/commitments-service'
import { obtenerCuentasPorMoneda } from '@/lib/finanzas'
import type { Libro } from '@/lib/almacen/libro'

export type DatosDeCompromisos = {
  curva: PuntoDeCurva[]
  planes: PlanActivo[]
  nombrePorCuenta: [string, string][]
  error: string | null
}

/** Las dos lecturas juntas, para que las dos rutas hagan exactamente lo mismo. */
export async function armarDatosDeCompromisos(
  libro: Libro,
  hoy: string
): Promise<DatosDeCompromisos> {
  const [{ curva, planes, error }, { cuentas }] = await Promise.all([
    cargarCompromisos(libro, hoy),
    obtenerCuentasPorMoneda(libro),
  ])

  return {
    curva,
    planes,
    // Un array de pares y no un Map: esto cruza del servidor al cliente como
    // props, y un Map no sobrevive la serializacion.
    nombrePorCuenta: Object.values(cuentas).map((c) => [c.id, c.name] as [string, string]),
    error,
  }
}
