import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Banknote, CreditCard, Landmark, PiggyBank, Wallet } from 'lucide-react'
import { AccountForm } from '@/components/account-form'
import { Card, CardLabel } from '@/components/ui/card'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { MONEDAS } from '@/lib/monedas'
import { createClient } from '@/lib/supabase/server'
import {
  ETIQUETA_TIPO_CUENTA,
  formatearMonto,
  type Cuenta,
  type Moneda,
  type TipoDeCuenta,
} from '@/lib/types'

export const metadata: Metadata = { title: 'Cuentas' }

const ICONO: Record<TipoDeCuenta, typeof Wallet> = {
  BANK: Landmark,
  WALLET: Wallet,
  CASH: Banknote,
  INVESTMENT: PiggyBank,
  CREDIT_CARD: CreditCard,
}

function FilaCuenta({ cuenta, detalle }: { cuenta: Cuenta; detalle?: string }) {
  const Icono = ICONO[cuenta.type] ?? Wallet
  const esTarjeta = cuenta.type === 'CREDIT_CARD'
  const saldo = Number(cuenta.balance ?? 0)
  // En una tarjeta el saldo negativo es deuda: se muestra en positivo.
  const mostrado = esTarjeta ? Math.abs(saldo) : saldo

  return (
    <li className="flex items-center gap-3 px-3.5 py-3">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-full ${
          esTarjeta ? 'bg-expense/10 text-expense' : 'bg-primary/10 text-primary'
        }`}
      >
        <Icono className="size-4" aria-hidden />
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium tracking-tight">{cuenta.name}</span>
        <span className="truncate text-xs text-subtle">
          {ETIQUETA_TIPO_CUENTA[cuenta.type]}
          {detalle && ` · ${detalle}`}
        </span>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span
          className={`text-sm font-semibold tabular-nums tracking-tight ${
            esTarjeta && saldo < 0 ? 'text-expense' : ''
          }`}
        >
          {formatearMonto(mostrado, cuenta.currency as Moneda)}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-subtle">
          {esTarjeta ? 'Deuda' : cuenta.is_liquid ? 'Líquido' : 'No líquido'}
        </span>
      </div>
    </li>
  )
}

export default async function AccountsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { cuentas, tarjetas, patrimonio, error } = await cargarCuentasYDeudas(supabase)
  const detallePorCuenta = new Map(
    tarjetas.map((t) => [
      t.id,
      `cierra el ${t.detalle.closing_day} · vence el ${t.detalle.due_day}`,
    ])
  )

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold tracking-tight">Cuentas y tarjetas</h1>

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

        <Card className="col-span-2 border-wealth/25 bg-wealth/[0.06] p-4">
          <CardLabel className="text-wealth">Patrimonio neto</CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {patrimonio.patrimonioNeto.map((t) => (
              <span
                key={t.moneda}
                className="text-xl font-semibold tabular-nums tracking-tight text-wealth"
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
            <h2 className="text-sm font-semibold tracking-tight">Cuentas en {moneda}</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {deLaMoneda.map((cuenta) => (
                <FilaCuenta
                  key={cuenta.id}
                  cuenta={cuenta}
                  detalle={detallePorCuenta.get(cuenta.id)}
                />
              ))}
            </ul>
          </section>
        )
      })}

      {cuentas.length === 0 && !error && (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-subtle">
          Todavía no tenés cuentas cargadas.
        </p>
      )}

      <AccountForm />
    </div>
  )
}
