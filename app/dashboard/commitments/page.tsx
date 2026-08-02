import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CalendarClock, CreditCard, PartyPopper, TrendingDown } from 'lucide-react'
import { DebtCurveChart } from '@/components/debt-curve-chart'
import { Card, CardLabel } from '@/components/ui/card'
import { cargarCompromisos, primerMesLibre } from '@/lib/commitments-service'
import { obtenerCuentasPorMoneda } from '@/lib/finanzas'
import { MONEDAS } from '@/lib/monedas'
import { createClient } from '@/lib/supabase/server'
import { formatearFecha, formatearMonto, hoyEnArgentina, type Moneda } from '@/lib/types'

export const metadata: Metadata = { title: 'Saldo comprometido' }

export default async function CommitmentsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const hoy = hoyEnArgentina()
  const [{ curva, planes, error }, { cuentas }] = await Promise.all([
    cargarCompromisos(supabase, hoy),
    obtenerCuentasPorMoneda(supabase),
  ])

  const nombreDeCuenta = new Map(Object.values(cuentas).map((c) => [c.id, c.name]))

  // Deuda total en cuotas y compromiso del mes que viene, por moneda.
  const totalPorMoneda = MONEDAS.map((moneda) => ({
    moneda,
    valor:
      Math.round(
        planes.filter((p) => p.moneda === moneda).reduce((s, p) => s + p.restante, 0) * 100
      ) / 100,
  }))

  const mesProximo = curva[1]?.porMoneda ?? []
  const mesLibre = primerMesLibre(curva)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <TrendingDown className="size-5 text-wealth" aria-hidden />
          Saldo comprometido
        </h1>
        <p className="mt-1 text-sm text-muted">
          Lo que ya debés por cuotas, mes a mes, antes de gastar un peso más.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-budget-warn/30 bg-budget-warn/10 px-4 py-3 text-sm text-budget-warn"
        >
          {error}
        </p>
      )}

      {/* --- Métricas ------------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="col-span-2 p-4">
          <CardLabel>
            <CreditCard className="size-3.5" aria-hidden />
            Total en cuotas
          </CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {totalPorMoneda.filter((t) => t.valor > 0).length === 0 ? (
              <span className="text-lg text-subtle">Sin cuotas pendientes</span>
            ) : (
              totalPorMoneda
                .filter((t) => t.valor > 0)
                .map((t) => (
                  <span
                    key={t.moneda}
                    className="text-[1.75rem] font-semibold leading-tight tracking-tight tabular-nums text-expense"
                  >
                    {formatearMonto(t.valor, t.moneda)}
                  </span>
                ))
            )}
          </div>
        </Card>

        <Card className="p-4">
          <CardLabel>
            <CalendarClock className="size-3.5" aria-hidden />
            Mes próximo
          </CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {mesProximo.filter((m) => m.valor > 0).length === 0 ? (
              <span className="text-sm text-subtle">Nada</span>
            ) : (
              mesProximo
                .filter((m) => m.valor > 0)
                .map((m) => (
                  <span
                    key={m.moneda}
                    className="text-base font-semibold tracking-tight tabular-nums"
                  >
                    {formatearMonto(m.valor, m.moneda)}
                  </span>
                ))
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">{curva[1]?.etiqueta ?? '—'}</p>
        </Card>

        <Card className="p-4">
          <CardLabel>
            <PartyPopper className="size-3.5" aria-hidden />
            Libre de cuotas
          </CardLabel>
          <p className="mt-2 text-base font-semibold tracking-tight text-income">
            {mesLibre ?? 'Más de 12 meses'}
          </p>
          <p className="mt-1.5 text-[11px] text-subtle">Primer mes sin vencimientos</p>
        </Card>
      </div>

      <DebtCurveChart curva={curva} />

      {/* --- Planes activos ------------------------------------------------ */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Planes de cuotas activos</h2>

        {planes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-subtle">
            No tenés planes de cuotas en curso.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {planes.map((plan) => {
              const avance = (plan.cuotaActual / plan.cuotasTotales) * 100

              return (
                <li key={plan.id} className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium tracking-tight">
                        {plan.descripcion}
                      </span>
                      <span className="truncate text-xs text-subtle">
                        {nombreDeCuenta.get(plan.cuentaId) ?? 'Cuenta'}
                        {plan.proximoVencimiento && ` · vence ${formatearFecha(plan.proximoVencimiento)}`}
                      </span>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums tracking-tight">
                        {formatearMonto(plan.montoDeCuota, plan.moneda as Moneda)}
                      </p>
                      <p className="text-[10px] text-subtle">por mes</p>
                    </div>
                  </div>

                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
                    role="progressbar"
                    aria-valuenow={Math.round(avance)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Avance de ${plan.descripcion}`}
                  >
                    <div
                      className="h-full rounded-full bg-wealth transition-all duration-500"
                      style={{ width: `${Math.min(avance, 100)}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
                    <span className="font-medium tabular-nums text-muted">
                      Cuota {plan.cuotaActual} de {plan.cuotasTotales}
                    </span>
                    <span className="tabular-nums text-subtle">
                      Restan {formatearMonto(plan.restante, plan.moneda as Moneda)} de{' '}
                      {formatearMonto(plan.totalDelPlan, plan.moneda as Moneda)}
                    </span>
                  </div>

                  {plan.tieneInteres && plan.recargo > 0 && (
                    <p className="rounded-lg border border-budget-warn/25 bg-budget-warn/10 px-2.5 py-1.5 text-[11px] tabular-nums text-budget-warn">
                      Recargo por financiar:{' '}
                      <strong className="font-semibold">
                        {formatearMonto(plan.recargo, plan.moneda as Moneda)}
                      </strong>{' '}
                      sobre el precio de contado
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
