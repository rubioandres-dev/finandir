/**
 * Los datos de la pantalla, aparte de la pantalla.
 *
 * Vive fuera del modulo 'use client' a proposito: en un modulo cliente TODOS
 * los exports son referencias, y el servidor los puede renderizar pero no
 * llamar. Como esto lo llaman las DOS rutas —la del servidor y la del
 * navegador— dejarlo alla rompe la pantalla apenas el servidor lo usa.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PresupuestoDeCategoria } from '@/components/budget-progress'
import type { Libro } from '@/lib/almacen/libro'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import type { Moneda } from '@/lib/types'

/**
 * Cuánto se lleva gastado de cada techo, por categoría y por moneda.
 *
 * El gasto se mide contra los movimientos del MES en curso: un presupuesto es
 * una pregunta que se rehace todos los meses, no un acumulado.
 */
export async function armarPresupuestos(
  libro: Libro,
  supabase: SupabaseClient,
  monedas: Moneda[]
): Promise<{ categorias: PresupuestoDeCategoria[]; faltaMigracion: boolean }> {
  const { categorias, delMes, presupuestos, faltaMigracion } = await cargarDatosDelDashboard(
    libro,
    supabase,
    undefined,
    monedas
  )

  const gastado = new Map<string, number>()
  for (const movimiento of delMes) {
    if (movimiento.type !== 'EXPENSE' || !movimiento.category_id) continue
    const clave = `${movimiento.category_id}:${movimiento.currency}`
    gastado.set(clave, (gastado.get(clave) ?? 0) + Number(movimiento.amount))
  }

  const limitePorClave = new Map(
    presupuestos.map((p) => [`${p.category_id}:${p.currency}`, Number(p.amount)])
  )

  return {
    faltaMigracion,
    categorias: categorias
      .filter((c) => c.type === 'EXPENSE')
      .map((c) => ({
        id: c.id,
        nombre: c.name,
        icono: c.icon,
        color: c.color,
        lineas: monedas.map((moneda) => ({
          moneda,
          presupuesto: limitePorClave.get(`${c.id}:${moneda}`) ?? null,
          gastado: gastado.get(`${c.id}:${moneda}`) ?? 0,
        })),
      })),
  }
}
