import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import {
  armarDatosDeObjetivos,
  ObjetivosEnCliente,
  VistaObjetivos,
  type DatosDeObjetivos,
} from '@/components/vistas/vista-objetivos'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Objetivos' }

export default async function GoalsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { monedas, xp } = await cargarContextoDeMonedas()

  let datos: DatosDeObjetivos | null = null

  try {
    const libro = await libroDelServidor(supabase, user.id)
    datos = await armarDatosDeObjetivos(libro, supabase, monedas)
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  if (!datos) return <ObjetivosEnCliente monedas={monedas} xp={xp} />

  return <VistaObjetivos datos={datos} xp={xp} />
}
