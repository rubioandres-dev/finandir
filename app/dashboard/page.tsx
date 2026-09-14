import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import {
  armarDatosDelHome,
  HomeEnCliente,
  VistaHome,
  type DatosDelHome,
} from '@/components/vistas/vista-home'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { createClient } from '@/lib/supabase/server'
import { hoyEnArgentina } from '@/lib/types'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Moneda activa del header: recorta todo lo que se muestra abajo.
  const { modo, monedas } = await cargarContextoDeMonedas()
  const hoy = hoyEnArgentina()

  let datos: DatosDelHome | null = null

  try {
    const libro = await libroDelServidor(supabase, user.id)
    datos = await armarDatosDelHome(libro, supabase, modo, monedas, hoy)
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  if (!datos) return <HomeEnCliente monedas={monedas} />

  return <VistaHome datos={datos} monedas={monedas} hoy={hoy} />
}
