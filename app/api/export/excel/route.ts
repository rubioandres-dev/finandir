import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { movimientosDesde } from '@/lib/almacen/consultas'
import { libroDelServidor } from '@/lib/almacen/acceso'
import { resumirBalance } from '@/lib/balance-overview'
import { cargarCompromisos } from '@/lib/commitments-service'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { construirLibro } from '@/lib/excel-export'
import { obtenerMapaDeCambio } from '@/lib/exchange'
import { crearTraductor } from '@/lib/i18n'
import { cargarInversiones } from '@/lib/investments-service'
import { cargarFlujoMensual } from '@/lib/monthly-flow'
import { obtenerCotizacionDelDia } from '@/lib/rates'
import { createClient } from '@/lib/supabase/server'
import { hoyEnArgentina, type Categoria } from '@/lib/types'

/**
 * Exportación del libro completo a `.xlsx`.
 *
 * RUNTIME NODE, NO EDGE
 *
 * exceljs escribe con `Buffer` y streams de Node. En el runtime edge no existen
 * y el build falla al resolver `stream`. No es negociable con una bandera: es
 * la dependencia la que pide Node.
 *
 * POR QUÉ UNA RUTA Y NO UNA SERVER ACTION
 *
 * Una action devuelve datos serializables al cliente, que después tendría que
 * armar un Blob y un enlace temporal. Una ruta puede responder con los headers
 * de descarga y dejar que el navegador haga lo que sabe hacer: un `<a download>`
 * y listo, sin pasar el archivo por el bundle de JavaScript.
 *
 * QUÉ VENTANA EXPORTA
 *
 * Los movimientos del AÑO en curso y la serie de doce meses. Exportar todo el
 * histórico haría un archivo que crece sin techo y una consulta sin límite; el
 * año es el recorte con el que se hace una declaración o un cierre, que es para
 * lo que se baja un Excel.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Sesión expirada.' }, { status: 401 })
  }

  // El `locale` no se usa: las celdas llevan números crudos con `numFmt`, y el
  // formato regional lo aplica Excel según la configuración de quien abre el
  // archivo. Ver la nota de `lib/excel-export.ts`.
  const { modo, monedas, idioma } = await cargarContextoDeMonedas()
  const t = crearTraductor(idioma)

  const hoy = hoyEnArgentina()
  const desdeElAnio = `${hoy.slice(0, 4)}-01-01`

  // Las lecturas van adentro del try porque `Libro` LANZA en vez de devolver
  // `{ error }`: la forma de reportar cambio al cruzar la interface, y dejar el
  // chequeo viejo haria que un fallo se escape como un 500 sin mensaje.
  let datos
  try {
    datos = await Promise.all([
      cargarCuentasYDeudas(await libroDelServidor(supabase), monedas),
      cargarInversiones(await libroDelServidor(supabase), monedas),
      cargarCompromisos(await libroDelServidor(supabase), hoy),
      cargarFlujoMensual(await libroDelServidor(supabase), modo, hoy),
      obtenerCotizacionDelDia(supabase),
      movimientosDesde(await libroDelServidor(supabase), desdeElAnio),
      (await libroDelServidor(supabase)).leer('categorias'),
    ])
  } catch (error) {
    console.error('[export/excel]', error)
    return Response.json({ error: 'No se pudieron leer los movimientos.' }, { status: 500 })
  }

  const [
    { cuentas, patrimonio },
    { inversiones: activos, resumen: carteraDeInversiones },
    { curva },
    { serie: flujoMensual },
    cotizacion,
    resMovimientos,
    resCategorias,
  ] = datos

  const { mapa } = await obtenerMapaDeCambio(supabase, monedas, cotizacion?.venta ?? null)

  const balance = resumirBalance({
    patrimonio,
    inversiones: carteraDeInversiones,
    monedas,
    destino: modo,
    mapa,
    cotizacion,
    cuotasDelMes: curva[0]?.porMoneda ?? [],
  })

  const generadoEn = new Date().toISOString()

  const libro = await construirLibro({
    idioma: t,
    moneda: modo,
    balance,
    patrimonio,
    inversiones: carteraDeInversiones,
    activos,
    cuentas,
    movimientos: resMovimientos,
    categorias: resCategorias as Pick<Categoria, 'id' | 'name'>[],
    flujoMensual,
    generadoEn,
  })

  const nombre = `aurem-${hoy}.xlsx`

  return new Response(libro, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      // Es una foto del momento: cachearla serviría un archivo viejo tras
      // cargar un movimiento.
      'Cache-Control': 'no-store',
    },
  })
}
