/**
 * Los datos de la pantalla, aparte de la pantalla.
 *
 * Vive fuera del modulo 'use client' a proposito: en un modulo cliente TODOS
 * los exports son referencias, y el servidor los puede renderizar pero no
 * llamar. Como esto lo llaman las DOS rutas —la del servidor y la del
 * navegador— dejarlo alla rompe la pantalla apenas el servidor lo usa.
 */

import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { cargarCompromisos } from '@/lib/commitments-service'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { obtenerMapaDeCambio } from '@/lib/exchange'
import { cargarInversiones } from '@/lib/investments-service'
import { cargarFlujoMensual } from '@/lib/monthly-flow'
import { obtenerCotizacionesDelMercado } from '@/lib/rates'
import type { Libro } from '@/lib/almacen/libro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { type Moneda } from '@/lib/types'

export type DatosDelHome = Awaited<ReturnType<typeof armarDatosDelHome>>

/**
 * Las ocho lecturas del Home, en un solo lugar.
 *
 * Las hacen las DOS rutas —la del servidor y la del navegador—, asi que vivir
 * en una funcion compartida no es prolijidad: duplicarlas seria dejar que el
 * Home muestre numeros distintos segun el modo de guardado del usuario.
 */
export async function armarDatosDelHome(
  libro: Libro,
  supabase: SupabaseClient,
  modo: Moneda,
  monedas: Moneda[],
  hoy: string
) {
  const datos = await cargarDatosDelDashboard(libro, supabase, modo, monedas)

  const [
    { tarjetas, cuentas, patrimonio },
    cotizacionesDeMercado,
    { resumen: carteraDeInversiones },
    { curva },
    { serie: flujoMensual },
  ] = await Promise.all([
    cargarCuentasYDeudas(libro, monedas),
    obtenerCotizacionesDelMercado(),
    cargarInversiones(libro, monedas),
    cargarCompromisos(libro, hoy),
    cargarFlujoMensual(libro, modo, hoy),
  ])

  // El mapa va después: reusa el MEP que `cargarDatosDelDashboard` ya resolvió
  // en vez de volver a pedirlo.
  const { mapa } = await obtenerMapaDeCambio(supabase, monedas, datos.cotizacion?.venta ?? null)

  return {
    ...datos,
    tarjetas,
    cuentas,
    patrimonio,
    cotizacionesDeMercado,
    carteraDeInversiones,
    curva,
    flujoMensual,
    mapa,
  }
}
