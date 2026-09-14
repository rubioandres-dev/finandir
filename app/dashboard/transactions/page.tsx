import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import {
  MovimientosEnCliente,
  VistaMovimientos,
  type DatosDeMovimientos,
} from '@/components/vistas/vista-movimientos'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { cargarFeedDeMovimientos } from '@/lib/transactions-feed'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Movimientos' }

export default async function TransactionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { modo, monedas } = await cargarContextoDeMonedas()

  let datos: DatosDeMovimientos | null = null

  try {
    const libro = await libroDelServidor(supabase, user.id)
    // `cargarDatosDelDashboard` sigue usándose solo por las categorías y la
    // cotización; los movimientos ahora vienen del feed, partido por período.
    const [dashboard, { cuentas }, feed] = await Promise.all([
      cargarDatosDelDashboard(libro, supabase, modo, monedas),
      cargarCuentasYDeudas(libro, monedas),
      cargarFeedDeMovimientos(libro, modo),
    ])
    datos = {
      categorias: dashboard.categorias,
      cotizacion: dashboard.cotizacion,
      errorCarga: dashboard.errorCarga,
      cuentas,
      feed,
    }
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  if (!datos) return <MovimientosEnCliente monedas={monedas} />

  return <VistaMovimientos datos={datos} />
}
