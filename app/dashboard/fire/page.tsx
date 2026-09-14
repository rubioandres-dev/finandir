import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FireEnCliente, VistaFire } from '@/components/vistas/vista-fire'
import { calcularFire, type DatosDeFire } from '@/components/vistas/datos-fire'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'FIRE' }

export default async function FirePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Sin filtrar por la moneda activa: FIRE se calcula para cada divisa que el
  // usuario tenga, porque el capital objetivo de una no dice nada de la otra.
  const { monedas } = await cargarContextoDeMonedas()

  let datos: DatosDeFire | null = null

  try {
    const libro = await libroDelServidor(supabase, user.id)
    const { delMes, ventana } = await cargarDatosDelDashboard(
      libro,
      supabase,
      undefined,
      monedas
    )
    datos = calcularFire(delMes, ventana, monedas)
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  if (!datos) return <FireEnCliente monedas={monedas} />

  return <VistaFire datos={datos} />
}
