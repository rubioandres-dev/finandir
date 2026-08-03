import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { DebtManager } from '@/components/debt-manager'
import { Card, CardLabel } from '@/components/ui/card'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { createClient } from '@/lib/supabase/server'
import { formatearMonto } from '@/lib/types'

export const metadata: Metadata = { title: 'Deudas' }

export default async function DebtsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { deudas, patrimonio, error } = await cargarCuentasYDeudas(supabase)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-lg font-bold tracking-tight text-on-background">Deudas y préstamos</h1>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-expense/30 bg-expense/10 px-4 py-3 text-sm text-expense"
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <CardLabel>Me deben</CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {patrimonio.porCobrar.map((t) => (
              <span key={t.moneda} className="text-base font-semibold tabular-nums text-income">
                {formatearMonto(t.valor, t.moneda)}
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <CardLabel>Debo</CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {patrimonio.deudaPersonal.map((t) => (
              <span key={t.moneda} className="text-base font-semibold tabular-nums text-expense">
                {formatearMonto(t.valor, t.moneda)}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <DebtManager deudas={deudas} />
    </div>
  )
}
