import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { TransactionList } from '@/components/transaction-list'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Movimientos' }

export default async function TransactionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { categorias, movimientos, bimoneda, errorCarga } = await cargarDatosDelDashboard(user.id)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Movimientos</h1>
        <span className="text-xs text-subtle">
          {movimientos.length === 100 ? 'Últimos 100' : `${movimientos.length} en total`}
        </span>
      </div>

      {errorCarga && (
        <p
          role="alert"
          className="rounded-2xl border border-expense/30 bg-expense/10 px-4 py-3 text-sm text-expense"
        >
          {errorCarga}
        </p>
      )}

      <TransactionList
        movimientos={movimientos}
        categorias={categorias}
        bimoneda={bimoneda}
        vacio="Todavía no registraste movimientos."
      />
    </div>
  )
}
