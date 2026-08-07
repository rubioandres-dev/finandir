import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { NightOutCalculator } from '@/components/night-out-calculator'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { esDeLaMoneda } from '@/lib/currency-mode'
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

  const { modo, monedas, idioma } = await cargarContextoDeMonedas()
  const t = crearTraductor(idioma)

  // La imputación del gasto necesita una categoría y una cuenta REALES: sin
  // esto la calculadora sólo podría mandar todo a la categoría por defecto y a
  // la cuenta de la moneda, que es justo lo que el usuario viene a elegir.
  const [resCategorias, { cuentas }] = await Promise.all([
    supabase.from('categories').select('name').eq('type', 'EXPENSE').order('name'),
    cargarCuentasYDeudas(supabase, monedas),
  ])

  // Solo las de la moneda activa: `guardarTransaccion` rechaza una cuenta cuya
  // divisa no coincide con la del movimiento, así que ofrecer las demás sería
  // ofrecer un error.
  const cuentasDeLaMoneda = cuentas
    .filter((c) => esDeLaMoneda(c, modo))
    .map((c) => ({ id: c.id, name: c.name, type: c.type, currency: c.currency }))

  const categorias = (resCategorias.data ?? []).map((c) => ({ nombre: c.name as string }))

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

      <NightOutCalculator categorias={categorias} cuentas={cuentasDeLaMoneda} />
    </div>
  )
}
