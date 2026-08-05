import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Calculator, Users } from 'lucide-react'
import { SharedSpacesList } from '@/components/shared-spaces-list'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { crearTraductor } from '@/lib/i18n'
import { cargarEspacios } from '@/lib/shared-expenses-service'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Gastos compartidos' }

export default async function SharedExpensesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { idioma } = await cargarContextoDeMonedas()
  const t = crearTraductor(idioma)
  const { espacios, error } = await cargarEspacios(supabase)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-on-background">
          <Users className="size-5 text-gold-leaf" aria-hidden />
          {t('compartidos.titulo')}
        </h1>
        <p className="text-xs leading-snug text-subtle">{t('compartidos.bajada')}</p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-budget-warn/30 bg-budget-warn/10 px-4 py-3 text-sm text-budget-warn"
        >
          {error}
        </p>
      )}

      <SharedSpacesList espacios={espacios} />

      {/* La calculadora no necesita grupo: es el caso de "salimos a cenar y
          pagué yo", que se resuelve sin crear nada. */}
      <Link
        href="/dashboard/shared-expenses/calculator"
        className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 transition hover:border-primary/40"
      >
        <Calculator className="size-4 shrink-0 text-gold-leaf" aria-hidden />
        <span className="min-w-0 flex-1 text-sm font-medium tracking-tight">
          {t('calculadora.titulo')}
        </span>
        <span className="shrink-0 text-[11px] text-subtle">{t('calculadora.porPersona')}</span>
      </Link>
    </div>
  )
}
