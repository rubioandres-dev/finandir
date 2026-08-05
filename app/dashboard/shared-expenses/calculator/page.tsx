import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { NightOutCalculator } from '@/components/night-out-calculator'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { crearTraductor } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Calculadora de salidas' }

export default async function CalculatorPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { idioma } = await cargarContextoDeMonedas()
  const t = crearTraductor(idioma)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/shared-expenses"
          aria-label="Volver"
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-glass-stroke/50 text-on-surface-variant transition hover:border-gold-leaf/60 hover:text-gold-leaf"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate font-display text-lg font-bold tracking-tight text-on-background">
            {t('calculadora.titulo')}
          </h1>
          <p className="text-[11px] leading-snug text-subtle">{t('calculadora.bajada')}</p>
        </div>
      </div>

      <NightOutCalculator />
    </div>
  )
}
