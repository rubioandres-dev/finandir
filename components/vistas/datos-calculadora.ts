/**
 * Los datos de la pantalla, aparte de la pantalla.
 *
 * Vive fuera del modulo 'use client' a proposito: en un modulo cliente TODOS
 * los exports son referencias, y el servidor los puede renderizar pero no
 * llamar. Como esto lo llaman las DOS rutas —la del servidor y la del
 * navegador— dejarlo alla rompe la pantalla apenas el servidor lo usa.
 */

import { esDeLaMoneda } from '@/lib/currency-mode'
import type { CuentaElegible, Moneda } from '@/lib/types'

export type DatosDeLaCalculadora = {
  categorias: { nombre: string }[]
  cuentas: CuentaElegible[]
}

/**
 * El recorte por moneda y por tipo vive acá para que las dos rutas lo hagan
 * igual. Duplicarlo en el `page.tsx` y en el cargador es como terminan
 * divergiendo: alguien arregla uno y no se acuerda del otro.
 */
export function armarDatosDeLaCalculadora(
  categorias: { name: string; type: string }[],
  cuentas: { id: string; name: string; type: string; currency: string }[],
  modo: Moneda
): DatosDeLaCalculadora {
  return {
    // Solo categorías de gasto: es lo único que una salida puede imputar.
    categorias: categorias
      .filter((c) => c.type === 'EXPENSE')
      .map((c) => ({ nombre: c.name })),
    // Solo las de la moneda activa: `guardarTransaccion` rechaza una cuenta
    // cuya divisa no coincide, así que ofrecer las demás sería ofrecer un error.
    cuentas: cuentas
      .filter((c) => esDeLaMoneda(c, modo))
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type as CuentaElegible['type'],
        currency: c.currency,
      })),
  }
}
