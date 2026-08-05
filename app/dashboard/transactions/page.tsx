import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { TransactionList } from '@/components/transaction-list'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { esDeLaMoneda } from '@/lib/currency-mode'
import { leerModoMoneda } from '@/lib/currency-mode-server'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { equivalenteAproximado } from '@/lib/monedas'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Movimientos' }

export default async function TransactionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const modo = await leerModoMoneda()
  const [{ categorias, movimientos, cotizacion, errorCarga }, { cuentas }] = await Promise.all([
    cargarDatosDelDashboard(modo),
    cargarCuentasYDeudas(supabase),
  ])

  // Para el editor: solo cuentas de la moneda activa, que son las únicas a las
  // que se puede mover un movimiento sin cambiarle la moneda.
  const cuentasElegibles = cuentas
    .filter((c) => esDeLaMoneda(c, modo))
    .map((c) => ({ id: c.id, name: c.name, type: c.type, currency: c.currency }))

  const equivalente = (m: { amount: number; currency: 'ARS' | 'USD' }) =>
    equivalenteAproximado(Number(m.amount), m.currency, cotizacion)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-lg font-bold tracking-tight text-on-background">
          Movimientos
        </h1>
        <span className="text-xs text-subtle">
          {movimientos.length} en {modo}
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
        equivalente={equivalente}
        cuentas={cuentasElegibles}
        editable
        vacio={`Todavía no registraste movimientos en ${modo}.`}
      />
    </div>
  )
}
