/**
 * Los datos de la pantalla, aparte de la pantalla.
 *
 * Vive fuera del modulo 'use client' a proposito: en un modulo cliente TODOS
 * los exports son referencias, y el servidor los puede renderizar pero no
 * llamar. Como esto lo llaman las DOS rutas —la del servidor y la del
 * navegador— dejarlo alla rompe la pantalla apenas el servidor lo usa.
 */

import type { CuentaElegible } from '@/lib/types'

/** Las tarjetas del usuario, para el selector del importador. */
export function tarjetasDe(cuentas: Record<string, { id: string; name: string; type: string; currency: string }>): CuentaElegible[] {
  return Object.values(cuentas)
    .filter((c) => c.type === 'CREDIT_CARD')
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type as CuentaElegible['type'],
      currency: c.currency,
    }))
}
