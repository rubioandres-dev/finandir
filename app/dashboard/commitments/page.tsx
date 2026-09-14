import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import {
  armarDatosDeCompromisos,
  CompromisosEnCliente,
  VistaCompromisos,
  type DatosDeCompromisos,
} from '@/components/vistas/vista-compromisos'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { createClient } from '@/lib/supabase/server'
import { hoyEnArgentina } from '@/lib/types'

export const metadata: Metadata = { title: 'Saldo comprometido' }

export default async function CommitmentsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const hoy = hoyEnArgentina()
  const { monedas } = await cargarContextoDeMonedas()

  let datos: DatosDeCompromisos | null = null

  try {
    const libro = await libroDelServidor(supabase, user.id)
    datos = await armarDatosDeCompromisos(libro, hoy)
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  if (!datos) return <CompromisosEnCliente monedas={monedas} hoy={hoy} />

  return <VistaCompromisos datos={datos} monedas={monedas} />
}
