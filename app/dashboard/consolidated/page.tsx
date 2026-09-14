import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ConsolidadoEnCliente, VistaConsolidado } from '@/components/vistas/vista-consolidado'
import { armarDatosDelConsolidado, type DatosDelConsolidado } from '@/components/vistas/datos-consolidado'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Consolidado' }

export default async function ConsolidatedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { monedas } = await cargarContextoDeMonedas()

  let datos: DatosDelConsolidado | null = null

  try {
    const libro = await libroDelServidor(supabase, user.id)
    datos = await armarDatosDelConsolidado(libro, supabase, monedas)
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  if (!datos) return <ConsolidadoEnCliente monedas={monedas} />

  return <VistaConsolidado datos={datos} monedas={monedas} />
}
