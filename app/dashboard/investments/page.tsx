import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Lightbulb, Percent, TrendingUp, Zap } from 'lucide-react'
import { InvestmentDistribution } from '@/components/investment-distribution'
import { InvestmentManager } from '@/components/investment-manager'
import { Card, CardLabel } from '@/components/ui/card'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { cargarInversiones, distribucionPorTipo } from '@/lib/investments-service'
import { createClient } from '@/lib/supabase/server'
import { crearFormateadores } from '@/lib/formatters'

export const metadata: Metadata = { title: 'Inversiones' }

export default async function InvestmentsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { monedas, locale } = await cargarContextoDeMonedas()
  const { formatearMonto } = crearFormateadores(locale)
  const { inversiones, resumen, error } = await cargarInversiones(supabase, monedas)

  // Un reparto por moneda: los libros no se mezclan, igual que en cuentas.
  const repartos = monedas.map((moneda) => ({
    moneda,
    tramos: distribucionPorTipo(inversiones, moneda),
  })).filter((r) => r.tramos.length > 0)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-lg font-bold tracking-tight text-on-background">
        Inversiones
      </h1>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-expense/30 bg-expense/10 px-4 py-3 text-sm text-expense"
        >
          {error}
        </p>
      )}

      {/* --- Hero: las tres métricas que definen la cartera ----------------- */}
      <section className="grid grid-cols-2 gap-3">
        <Card glass className="glow-gold col-span-2 p-5">
          <CardLabel className="text-gold-leaf">
            <TrendingUp className="size-3.5" aria-hidden />
            Patrimonio invertido total
          </CardLabel>
          <div className="mt-2.5 flex flex-col gap-0.5">
            {resumen.valorActual.map((total) => (
              <span
                key={total.moneda}
                className="font-display text-[1.75rem] font-bold leading-tight tracking-tighter tabular-nums text-gold-leaf"
              >
                {formatearMonto(total.valor, total.moneda)}
              </span>
            ))}
          </div>

          {/* Resultado contra el costo: es lo único que dice si va bien. */}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
            {resumen.resultado.map((total) =>
              total.valor === 0 ? null : (
                <span
                  key={total.moneda}
                  className={`text-[11px] font-medium tabular-nums ${
                    total.valor > 0 ? 'text-income' : 'text-expense'
                  }`}
                >
                  {total.valor > 0 ? '+' : '−'}
                  {formatearMonto(Math.abs(total.valor), total.moneda)} sobre lo invertido
                </span>
              )
            )}
          </div>

          <div className="fire-gradient mt-4 h-px w-full opacity-40" aria-hidden />
        </Card>

        <Card glass className="p-4">
          <CardLabel>
            <Percent className="size-3.5 text-gold-leaf" aria-hidden />
            Rendimiento promedio
          </CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {monedas.map((moneda) => {
              const tna = resumen.tnaLiquida[moneda]
              if (tna === null || tna === undefined) return null
              return (
                <span
                  key={moneda}
                  className="font-display text-lg font-bold tracking-tight tabular-nums text-gold-leaf"
                >
                  {tna}% <span className="text-[11px] font-medium text-subtle">TNA {moneda}</span>
                </span>
              )
            })}
            {monedas.every((m) => !resumen.tnaLiquida[m]) && (
              <span className="font-display text-lg font-bold tracking-tight text-subtle">—</span>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">Ponderado sobre lo líquido</p>
        </Card>

        <Card glass className="p-4">
          <CardLabel>
            <Zap className="size-3.5 text-success-emerald" aria-hidden />
            Liquidez inmediata
          </CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {resumen.liquidezInmediata.map((total) => (
              <span
                key={total.moneda}
                className="font-display text-lg font-bold tracking-tight tabular-nums text-success-emerald"
              >
                {formatearMonto(total.valor, total.moneda)}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">Rescatable hoy (T+0)</p>
        </Card>
      </section>

      {repartos.length > 0 && (
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
          <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
            Distribución por tipo
          </h2>
          {repartos.map(({ moneda, tramos }) => (
            <div key={moneda} className="flex flex-col gap-2">
              {repartos.length > 1 && (
                <span className="text-[10px] font-semibold tabular-nums text-subtle">{moneda}</span>
              )}
              <InvestmentDistribution tramos={tramos} moneda={moneda} locale={locale} />
            </div>
          ))}
        </section>
      )}

      <InvestmentManager inversiones={inversiones} />

      {/* El puente con la otra mitad del módulo: la cartera define la tasa con
          la que el asistente decide cómo pagar. */}
      <Link
        href="/dashboard/smart-spend"
        className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 transition hover:border-primary/40"
      >
        <Lightbulb className="size-4 shrink-0 text-gold-leaf" aria-hidden />
        <span className="min-w-0 flex-1 text-sm font-medium tracking-tight">
          ¿Cómo conviene pagar?
        </span>
        <span className="shrink-0 text-[11px] text-subtle">Asistente de gasto</span>
      </Link>
    </div>
  )
}
