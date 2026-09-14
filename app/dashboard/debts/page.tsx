import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { DeudasEnCliente } from '@/components/vistas/deudas-en-cliente'
import { VistaDeudas } from '@/components/vistas/vista-deudas'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Deudas' }

/**
 * LAS DOS RUTAS DE LA MISMA PANTALLA
 * =============================================================================
 *
 * En modo Estándar el servidor lee y manda la página ya dibujada, que es más
 * rápido y funciona sin JavaScript. En modo Bóveda no puede: la clave vive en
 * el dispositivo del usuario, así que se manda la cáscara y el navegador lee.
 *
 * `ModoCifradoEnServidor` NO es un error para mostrar. Es la respuesta correcta
 * a "¿podés leer esto?", y la página la usa para decidir por dónde ir.
 *
 * Es el patrón que van a seguir las otras pantallas con datos.
 */
export default async function DebtsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Las preferencias no se cifran, así que esto anda en los dos modos y el
  // cargador del navegador no tiene que volver a leerlas.
  const { monedas } = await cargarContextoDeMonedas()

  // El try envuelve SOLO la lectura y no el JSX: construir elementos adentro de
  // un try se traga los errores de render de los hijos, que es como se pierde
  // un bug de la vista haciendolo pasar por "modo cifrado".
  let datos: Awaited<ReturnType<typeof cargarCuentasYDeudas>> | null = null

  try {
    const libro = await libroDelServidor(supabase, user.id)
    datos = await cargarCuentasYDeudas(libro, monedas)
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  if (!datos) return <DeudasEnCliente monedas={monedas} />

  return <VistaDeudas deudas={datos.deudas} patrimonio={datos.patrimonio} error={datos.error} />
}
