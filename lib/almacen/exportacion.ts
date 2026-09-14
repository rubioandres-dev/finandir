/**
 * EXPORTAR A EXCEL, DESDE DONDE SE PUEDA
 * =============================================================================
 *
 * El armado de la planilla vive en `lib/excel-export.ts` y no sabe de dónde
 * salen los datos. Esto junta los datos, y lo hacen las DOS rutas:
 *
 *     modo Estándar  ->  la ruta /api/export/excel, en el servidor
 *     modo Bóveda    ->  el navegador, que es el único que puede descifrar
 *
 * Duplicar el armado sería dejar que la planilla tenga columnas distintas según
 * el modo de guardado del usuario, que es la clase de diferencia que se
 * descubre cuando alguien compara dos exports y no entiende cuál está bien.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { cargarCuentasYDeudas } from '../accounts-service'
import { resumirBalance } from '../balance-overview'
import { cargarCompromisos } from '../commitments-service'
import type { DatosDeExportacion } from '../excel-export'
import { obtenerMapaDeCambio } from '../exchange'
import type { Traductor } from '../i18n'
import { cargarInversiones } from '../investments-service'
import { cargarFlujoMensual } from '../monthly-flow'
import { obtenerCotizacionDelDia } from '../rates'
import { hoyEnArgentina, type Categoria, type Moneda } from '../types'
import { movimientosDesde } from './consultas'
import type { Libro } from './libro'

export async function armarDatosDeExportacion(
  libro: Libro,
  supabase: SupabaseClient,
  t: Traductor,
  modo: Moneda,
  monedas: Moneda[]
): Promise<DatosDeExportacion> {
  const hoy = hoyEnArgentina()
  const desdeElAnio = `${hoy.slice(0, 4)}-01-01`

  const [
    { cuentas, patrimonio },
    { inversiones: activos, resumen: carteraDeInversiones },
    { curva },
    { serie: flujoMensual },
    cotizacion,
    movimientos,
    categorias,
  ] = await Promise.all([
    cargarCuentasYDeudas(libro, monedas),
    cargarInversiones(libro, monedas),
    cargarCompromisos(libro, hoy),
    cargarFlujoMensual(libro, modo, hoy),
    obtenerCotizacionDelDia(supabase),
    movimientosDesde(libro, desdeElAnio),
    libro.leer('categorias'),
  ])

  const { mapa } = await obtenerMapaDeCambio(supabase, monedas, cotizacion?.venta ?? null)

  return {
    idioma: t,
    moneda: modo,
    balance: resumirBalance({
      patrimonio,
      inversiones: carteraDeInversiones,
      monedas,
      destino: modo,
      mapa,
      cotizacion,
      cuotasDelMes: curva[0]?.porMoneda ?? [],
    }),
    patrimonio,
    inversiones: carteraDeInversiones,
    activos,
    cuentas,
    movimientos,
    categorias: categorias as Pick<Categoria, 'id' | 'name'>[],
    flujoMensual,
    generadoEn: new Date().toISOString(),
  }
}

/** `aurem-2026-09-14.xlsx`. Igual en los dos caminos. */
export function nombreDelArchivo(): string {
  return `aurem-${hoyEnArgentina()}.xlsx`
}
