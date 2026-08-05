import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileScan, PiggyBank, TrendingDown } from 'lucide-react'
import { AccountForm } from '@/components/account-form'
import { AccountRow } from '@/components/account-row'
import { Card, CardLabel } from '@/components/ui/card'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { MONEDAS } from '@/lib/monedas'
import { createClient } from '@/lib/supabase/server'
import { formatearMonto } from '@/lib/types'

export const metadata: Metadata = { title: 'Cuentas' }

export default async function AccountsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { cuentas, tarjetas, patrimonio, error } = await cargarCuentasYDeudas(supabase)
  const detallePorCuenta = new Map(tarjetas.map((t) => [t.id, t.detalle]))

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-lg font-bold tracking-tight text-on-background">Cuentas y tarjetas</h1>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-expense/30 bg-expense/10 px-4 py-3 text-sm text-expense"
        >
          {error}
        </p>
      )}

      {/* Resumen patrimonial, siempre desagregado por moneda. */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <CardLabel>Líquido</CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {patrimonio.liquido.map((t) => (
              <span key={t.moneda} className="text-sm font-semibold tabular-nums text-income">
                {formatearMonto(t.valor, t.moneda)}
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <CardLabel>Deuda en tarjetas</CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {patrimonio.deudaTarjetas.map((t) => (
              <span key={t.moneda} className="text-sm font-semibold tabular-nums text-expense">
                {formatearMonto(t.valor, t.moneda)}
              </span>
            ))}
          </div>
        </Card>

        <Card glass className="glow-gold col-span-2 p-4">
          <CardLabel className="text-gold-leaf">Patrimonio neto</CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {patrimonio.patrimonioNeto.map((t) => (
              <span
                key={t.moneda}
                className="font-display text-xl font-bold tabular-nums tracking-tighter text-gold-leaf"
              >
                {formatearMonto(t.valor, t.moneda)}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Líquido + inversiones + por cobrar − tarjetas − deudas
          </p>
        </Card>
      </div>

      {/* Un bloque por moneda: los libros no se mezclan. */}
      {MONEDAS.map((moneda) => {
        const deLaMoneda = cuentas.filter((c) => c.currency.trim() === moneda)
        if (deLaMoneda.length === 0) return null

        return (
          <section key={moneda} className="flex flex-col gap-2">
            <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">Cuentas en {moneda}</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {deLaMoneda.map((cuenta) => (
                <AccountRow
                  key={cuenta.id}
                  cuenta={cuenta}
                  detalle={detallePorCuenta.get(cuenta.id)}
                />
              ))}
            </ul>
          </section>
        )
      })}

      {/* Accesos a las vistas que dependen de las tarjetas. */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/dashboard/investments"
          className="col-span-2 flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 transition hover:border-primary/40"
        >
          <PiggyBank className="size-4 shrink-0 text-gold-leaf" aria-hidden />
          <span className="min-w-0 flex-1 text-sm font-medium tracking-tight">Inversiones</span>
          <span className="shrink-0 text-[11px] text-subtle">Cartera y rendimiento</span>
        </Link>

        <Link
          href="/dashboard/commitments"
          className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 transition hover:border-primary/40"
        >
          <TrendingDown className="size-4 shrink-0 text-wealth" aria-hidden />
          <span className="min-w-0 text-sm font-medium tracking-tight">Saldo comprometido</span>
        </Link>

        <Link
          href="/dashboard/cards/import"
          className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 transition hover:border-primary/40"
        >
          <FileScan className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 text-sm font-medium tracking-tight">Importar resumen</span>
        </Link>
      </div>

      {cuentas.length === 0 && !error && (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-subtle">
          Todavía no tenés cuentas cargadas.
        </p>
      )}

      <AccountForm />
    </div>
  )
}
