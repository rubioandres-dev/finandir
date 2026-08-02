import { redirect } from 'next/navigation'
import { CurrencyProvider } from '@/components/currency-provider'
import { CurrencyToggle } from '@/components/currency-toggle'
import { LogoutButton } from '@/components/logout-button'
import { obtenerCotizacionDelDia } from '@/lib/rates'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // El proxy ya bloquea el acceso, pero no alcanza como única defensa: si el
  // matcher cambia o la ruta se consume de otra forma, esto sigue protegiendo.
  if (!user) redirect('/login')

  const cotizacion = await obtenerCotizacionDelDia(supabase)

  return (
    <CurrencyProvider>
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-black/[0.07] bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-black/80">
          <nav className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-5 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
                F
              </span>
              <span className="hidden truncate text-sm text-black/55 sm:inline dark:text-white/55">
                {user.email}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CurrencyToggle cotizacion={cotizacion?.venta ?? null} />
              <LogoutButton />
            </div>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-24 pt-6">{children}</main>
      </div>
    </CurrencyProvider>
  )
}
