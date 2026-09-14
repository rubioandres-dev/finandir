import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ImportarEnCliente, VistaImportar } from '@/components/vistas/vista-importar'
import { tarjetasDe } from '@/components/vistas/datos-importar'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'
import { obtenerCuentasPorMoneda } from '@/lib/finanzas'
import { createClient } from '@/lib/supabase/server'
import type { CuentaElegible } from '@/lib/types'

export const metadata: Metadata = { title: 'Importar resumen' }

export default async function ImportStatementPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let tarjetas: CuentaElegible[] | null = null

  try {
    const libro = await libroDelServidor(supabase, user.id)
    tarjetas = tarjetasDe((await obtenerCuentasPorMoneda(libro)).cuentas)
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  if (!tarjetas) return <ImportarEnCliente />

  return <VistaImportar tarjetas={tarjetas} />
}
