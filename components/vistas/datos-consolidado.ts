/**
 * Los datos de la pantalla, aparte de la pantalla.
 *
 * Vive fuera del modulo 'use client' a proposito: en un modulo cliente TODOS
 * los exports son referencias, y el servidor los puede renderizar pero no
 * llamar. Como esto lo llaman las DOS rutas —la del servidor y la del
 * navegador— dejarlo alla rompe la pantalla apenas el servidor lo usa.
 */

import { cargarCuentasYDeudas, type Patrimonio } from '@/lib/accounts-service'
import { obtenerMapaDeCambio, type MapaDeCambio } from '@/lib/exchange'
import { cargarInversiones, type ResumenDeInversiones } from '@/lib/investments-service'
import { obtenerCotizacionDelDia, type Cotizacion } from '@/lib/rates'
import type { Libro } from '@/lib/almacen/libro'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Moneda } from '@/lib/types'

export type DatosDelConsolidado = {
  patrimonio: Patrimonio
  resumen: ResumenDeInversiones
  cotizacion: Cotizacion | null
  mapa: MapaDeCambio
  error: string | null
}

export async function armarDatosDelConsolidado(
  libro: Libro,
  supabase: SupabaseClient,
  monedas: Moneda[]
): Promise<DatosDelConsolidado> {
  const [{ patrimonio, error: errorCuentas }, { resumen, error: errorInversiones }, cotizacion] =
    await Promise.all([
      cargarCuentasYDeudas(libro, monedas),
      cargarInversiones(libro, monedas),
      obtenerCotizacionDelDia(supabase),
    ])

  // El MEP ya resuelto se le pasa al mapa para no pedirlo dos veces; el resto
  // de las divisas se cotiza contra el peso.
  const { mapa } = await obtenerMapaDeCambio(supabase, monedas, cotizacion?.venta ?? null)

  return {
    patrimonio,
    resumen,
    cotizacion,
    mapa,
    error: errorCuentas ?? errorInversiones,
  }
}
