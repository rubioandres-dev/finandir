import { redirect } from 'next/navigation'
import { CurrencyProvider } from '@/components/currency-provider'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Header } from '@/components/layout/header'
import { obtenerCotizacionDelDia } from '@/lib/rates'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const cotizacion = await obtenerCotizacionDelDia(supabase)

  return (
    <CurrencyProvider>
      <div className="flex flex-1 flex-col">
        <Header email={user.email ?? ''} cotizacion={cotizacion?.venta ?? null} />

        {/* pb-28 en mobile deja lugar para la barra inferior flotante. */}
        <main className="safe-x mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-5 sm:px-6 md:pb-12">
          {children}
        </main>

        <BottomNav />
      </div>
    </CurrencyProvider>
  )
}
