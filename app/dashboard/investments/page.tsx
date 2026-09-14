import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import {
  InversionesEnCliente,
  VistaInversiones,
  type DatosDeInversiones,
} from '@/components/vistas/vista-inversiones'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { cargarInversiones } from '@/lib/investments-service'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Inversiones' }

export default async function InvestmentsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { monedas } = await cargarContextoDeMonedas()

  let datos: DatosDeInversiones | null = null

  try {
    const libro = await libroDelServidor(supabase, user.id)
    datos = await cargarInversiones(libro, monedas)
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  if (!datos) return <InversionesEnCliente monedas={monedas} />

  return <VistaInversiones datos={datos} />
}
