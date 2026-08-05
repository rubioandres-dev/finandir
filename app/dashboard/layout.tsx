import { redirect } from 'next/navigation'
import { CurrencyProvider } from '@/components/currency-provider'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Header } from '@/components/layout/header'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { cargarDatosDeCabecera } from '@/lib/header-data'
import { obtenerCotizacionDelDia } from '@/lib/rates'
import { createClient } from '@/lib/supabase/server'
import { hoyEnArgentina } from '@/lib/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [cotizacion, { tarjetas }] = await Promise.all([
    obtenerCotizacionDelDia(supabase),
    cargarCuentasYDeudas(supabase),
  ])

  const { nivel, avisos } = await cargarDatosDeCabecera(supabase, tarjetas, hoyEnArgentina())

  return (
    <CurrencyProvider>
      <div className="flex flex-1 flex-col">
        <Header
          email={user.email ?? ''}
          // Supabase guarda lo que le mandemos en user_metadata; el nombre no
          // necesita tabla propia.
          nombre={
            typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name
              ? user.user_metadata.full_name
              : null
          }
          cotizacion={cotizacion?.venta ?? null}
          nivel={nivel}
          avisos={avisos}
        />

        {/* pb-28 en mobile deja lugar para la barra inferior flotante. */}
        <main className="safe-x mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-12">
          {children}
        </main>

        <BottomNav />
      </div>
    </CurrencyProvider>
  )
}
