import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import {
  CuentasEnCliente,
  VistaCuentas,
  type DatosDeCuentas,
} from '@/components/vistas/vista-cuentas'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Cuentas' }

export default async function AccountsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { monedas } = await cargarContextoDeMonedas()

  let datos: DatosDeCuentas | null = null

  try {
    const libro = await libroDelServidor(supabase, user.id)
    datos = await cargarCuentasYDeudas(libro, monedas)
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  if (!datos) return <CuentasEnCliente monedas={monedas} />

  return <VistaCuentas datos={datos} />
}
