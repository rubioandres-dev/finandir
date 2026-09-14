import { armarDatosDeExportacion, nombreDelArchivo } from '@/lib/almacen/exportacion'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { construirLibro } from '@/lib/excel-export'
import { crearTraductor } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'

/**
 * Exportación del libro completo a `.xlsx`.
 *
 * RUNTIME NODE, NO EDGE
 *
 * exceljs escribe con `Buffer` y streams de Node. En el runtime edge no existen
 * y la ruta falla en tiempo de ejecución, no de build.
 *
 * EN MODO BÓVEDA ESTA RUTA NO PUEDE
 *
 * El servidor no tiene la clave. Devuelve 501 y el navegador arma la planilla
 * por su cuenta con los mismos datos: ver `exportarEnNavegador`.
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

  let datos
  try {
    const libro = await libroDelServidor(supabase, user.id)
    datos = await armarDatosDeExportacion(libro, supabase, crearTraductor(idioma), modo, monedas)
  } catch (error) {
    // No es un fallo: es la respuesta correcta. El cliente la reconoce por el
    // 501 y arma la planilla él mismo, que es el único que puede descifrar.
    if (error instanceof ModoCifradoEnServidor) {
      return Response.json({ error: 'modo-cifrado' }, { status: 501 })
    }

    console.error('[export/excel]', error)
    return Response.json({ error: 'No se pudieron leer los movimientos.' }, { status: 500 })
  }

  const planilla = await construirLibro(datos)
  const nombre = nombreDelArchivo()

  return new Response(planilla, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  })
}
