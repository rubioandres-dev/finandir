import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CalendarClock, CreditCard, PartyPopper, TrendingDown } from 'lucide-react'
import { DebtCurveChart } from '@/components/debt-curve-chart'
import { Card, CardLabel } from '@/components/ui/card'
import { cargarCompromisos, primerMesLibre } from '@/lib/commitments-service'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { obtenerCuentasPorMoneda } from '@/lib/finanzas'
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
  const [{ curva, planes, error }, { cuentas }, { monedas }] = await Promise.all([
    cargarCompromisos(supabase, hoy),
    obtenerCuentasPorMoneda(supabase),
    cargarContextoDeMonedas(),
  ])

  const nombreDeCuenta = new Map(Object.values(cuentas).map((c) => [c.id, c.name]))

  // Pasivo futuro total: todo lo que falta pagar en cuotas, por moneda.
  const totalPorMoneda = monedas.map((moneda) => ({
    moneda,
    valor:
      Math.round(
        planes.filter((p) => p.moneda === moneda).reduce((s, p) => s + p.restante, 0) * 100
      ) / 100,
  }))

  /**
   * Cuota promedio mensual: se promedia solo sobre los meses que tienen algo
   * que pagar. Dividir por los 12 de la ventana diluiría el número justo
   * cuando el plan está por terminar, que es cuando más importa verlo.
   */
  const promedioPorMoneda = monedas.map((moneda) => {
    const valores = curva
      .map((punto) => punto.porMoneda.find((m) => m.moneda === moneda)?.valor ?? 0)
      .filter((valor) => valor > 0)

    return {
      moneda,
      valor: valores.length
        ? Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 100) / 100
        : 0,
    }
  })

  const mesLibre = primerMesLibre(curva)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-on-background">
          <TrendingDown className="size-5 text-gold-leaf" aria-hidden />
          Saldo comprometido
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
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
        <Card glass className="glow-gold col-span-2 p-5">
          <CardLabel>
            <CreditCard className="size-3.5 text-gold-leaf" aria-hidden />
            Total pasivo futuro
          </CardLabel>
          <div className="mt-2.5 flex flex-col gap-0.5">
            {totalPorMoneda.filter((t) => t.valor > 0).length === 0 ? (
              <span className="text-lg text-subtle">Sin cuotas pendientes</span>
            ) : (
              totalPorMoneda
                .filter((t) => t.valor > 0)
                .map((t) => (
                  <span
                    key={t.moneda}
                    className="font-display text-[2rem] font-bold leading-tight tracking-tighter tabular-nums text-error-rose"
                  >
                    {formatearMonto(t.valor, t.moneda)}
                  </span>
                ))
            )}
          </div>
          <div className="fire-gradient mt-4 h-px w-full opacity-40" aria-hidden />
        </Card>

        <Card glass className="p-4">
          <CardLabel>
            <CalendarClock className="size-3.5 text-gold-leaf" aria-hidden />
            Cuota promedio
          </CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {promedioPorMoneda.filter((m) => m.valor > 0).length === 0 ? (
              <span className="text-sm text-subtle">—</span>
            ) : (
              promedioPorMoneda
                .filter((m) => m.valor > 0)
                .map((m) => (
                  <span
                    key={m.moneda}
                    className="font-display text-base font-bold tracking-tight tabular-nums text-on-background"
                  >
                    {formatearMonto(m.valor, m.moneda)}
                  </span>
                ))
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">Por mes con vencimientos</p>
        </Card>

        <Card glass className="p-4">
          <CardLabel>
            <PartyPopper className="size-3.5 text-gold-leaf" aria-hidden />
            Libertad de cuotas
          </CardLabel>
          <p className="mt-2 font-display text-base font-bold tracking-tight text-success-emerald">
            {mesLibre ?? 'Más de 12 meses'}
          </p>
          <p className="mt-1.5 text-[11px] text-subtle">Primer mes sin vencimientos</p>
        </Card>
      </div>

      <DebtCurveChart curva={curva} />

      {/* --- Planes activos ------------------------------------------------ */}
      <section className="flex flex-col gap-3">
        <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
          Planes de cuotas activos
        </h2>

        {planes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-glass-stroke/60 px-4 py-10 text-center text-sm text-subtle">
            No tenés planes de cuotas en curso.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {planes.map((plan) => {
              const avance = (plan.cuotaActual / plan.cuotasTotales) * 100

              return (
                <li
                  key={plan.id}
                  className="glass-card flex flex-col gap-2.5 rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold tracking-tight text-on-background">
                        {plan.descripcion}
                      </span>
                      <span className="truncate text-xs text-subtle">
                        {nombreDeCuenta.get(plan.cuentaId) ?? 'Cuenta'}
                        {plan.proximoVencimiento &&
                          ` · vence ${formatearFecha(plan.proximoVencimiento)}`}
                      </span>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-display text-sm font-bold tabular-nums tracking-tight text-gold-leaf">
                        {formatearMonto(plan.montoDeCuota, plan.moneda as Moneda)}
                      </p>
                      <p className="text-[10px] text-subtle">por mes</p>
                    </div>
                  </div>

                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-gold-leaf/10"
                    role="progressbar"
                    aria-valuenow={Math.round(avance)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Avance de ${plan.descripcion}`}
                  >
                    <div
                      className="fire-gradient h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(avance, 100)}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
                    <span className="font-semibold tabular-nums text-gold-leaf">
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
