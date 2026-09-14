/**
 * Los datos de la pantalla, aparte de la pantalla.
 *
 * Vive fuera del modulo 'use client' a proposito: en un modulo cliente TODOS
 * los exports son referencias, y el servidor los puede renderizar pero no
 * llamar. Como esto lo llaman las DOS rutas —la del servidor y la del
 * navegador— dejarlo alla rompe la pantalla apenas el servidor lo usa.
 */

import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { cargarObjetivos, type BaseDeMedicion } from '@/lib/goals-service'
import { cargarInversiones } from '@/lib/investments-service'
import type { Moneda } from '@/lib/types'

/** Total de una magnitud en la divisa principal. Los libros no se mezclan. */
function enPrincipal(
  totales: { moneda: string; valor: number }[],
  principal: string
): number {
  return totales.find((x) => x.moneda === principal)?.valor ?? 0
}

export type DatosDeObjetivos = {
  /** La divisa en la que se mide todo. Viaja con los datos porque el JSX la muestra. */
  principal: Moneda
  base: BaseDeMedicion
  objetivos: Awaited<ReturnType<typeof cargarObjetivos>>['objetivos']
  faltaMigracion: boolean
}

/**
 * Todo se mide en la divisa PRINCIPAL. Un objetivo de ahorro no puede promediar
 * una tasa en pesos con otra en dólares: serían dos números distintos sumados
 * como si fueran el mismo.
 */
export async function armarDatosDeObjetivos(
  libro: Parameters<typeof cargarObjetivos>[0],
  supabase: Parameters<typeof cargarDatosDelDashboard>[1],
  monedas: Moneda[]
): Promise<DatosDeObjetivos> {
  const principal = monedas[0]

  const [datos, { patrimonio }, { resumen }, { objetivos, faltaMigracion }] =
    await Promise.all([
      cargarDatosDelDashboard(libro, supabase, undefined, monedas),
      cargarCuentasYDeudas(libro, monedas),
      cargarInversiones(libro, monedas),
      cargarObjetivos(libro),
    ])

  return {
    principal,
    base: {
      ingresosDelMes: enPrincipal(datos.ingresosDelMes, principal),
      gastosDelMes: enPrincipal(datos.gastosDelMes, principal),
      inversiones: enPrincipal(resumen.valorActual, principal),
      liquido: enPrincipal(patrimonio.liquido, principal),
      deuda:
        enPrincipal(patrimonio.deudaTarjetas, principal) +
        enPrincipal(patrimonio.deudaPersonal, principal),
    },
    objetivos,
    faltaMigracion,
  }
}
