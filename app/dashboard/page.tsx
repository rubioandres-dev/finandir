import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { AnalyticsChart } from '@/components/analytics-chart'
import { BudgetProgress, type PresupuestoDeCategoria } from '@/components/budget-progress'
import { Monto } from '@/components/monto'
import { SmartInput } from '@/components/smart-input'
import { TransactionList } from '@/components/transaction-list'
import { Card, CardLabel } from '@/components/ui/card'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { sumarMontos } from '@/lib/rates'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const {
    cuenta,
    cotizacion,
    categorias,
    movimientos,
    ventana,
    delMes,
    balanceArs,
    faltaMigracion,
    errorCarga,
    bimoneda,
  } = await cargarDatosDelDashboard(user.id)

  // El saldo lo mantiene un trigger que suma `amount` sin mirar la moneda;
  // solo es fiable mientras todo esté en pesos. Ver migrations/002.
  const balanceTotal = {
    ars: balanceArs,
    usd: cotizacion ? Math.round((balanceArs / cotizacion.venta) * 100) / 100 : null,
  }

  const ingresosDelMes = sumarMontos(delMes.filter((t) => t.type === 'INCOME').map(bimoneda))
  const gastosDelMes = sumarMontos(delMes.filter((t) => t.type === 'EXPENSE').map(bimoneda))

  // Gasto del mes por categoría. Los presupuestos se definen en pesos.
  const gastadoPorCategoria = new Map<string, number>()
  for (const movimiento of delMes) {
    if (movimiento.type !== 'EXPENSE' || !movimiento.category_id) continue
    gastadoPorCategoria.set(
      movimiento.category_id,
      (gastadoPorCategoria.get(movimiento.category_id) ?? 0) + (bimoneda(movimiento).ars ?? 0)
    )
  }

  const presupuestos: PresupuestoDeCategoria[] = categorias
    .filter((c) => c.type === 'EXPENSE')
    .map((c) => ({
      id: c.id,
      nombre: c.name,
      icono: c.icon,
      color: c.color,
      presupuesto: c.monthly_budget === null ? null : Number(c.monthly_budget),
      gastado: gastadoPorCategoria.get(c.id) ?? 0,
    }))

  const gastosParaGrafico = ventana
    .filter((t) => t.type === 'EXPENSE')
    .map((t) => ({ amount: bimoneda(t).ars ?? 0, date: t.date, category_id: t.category_id }))

  return (
    <div className="flex flex-col gap-5">
      {errorCarga && (
        <p
          role="alert"
          className="rounded-2xl border border-expense/30 bg-expense/10 px-4 py-3 text-sm text-expense"
        >
          Hubo un problema al cargar tus datos: {errorCarga}
        </p>
      )}

      {/* --- Resumen ------------------------------------------------------ */}
      <section className="grid grid-cols-2 gap-3">
        <Card className="col-span-2 p-4">
          <CardLabel>
            <Wallet className="size-3.5" aria-hidden />
            Balance total
          </CardLabel>
          <Monto
            ars={balanceTotal.ars}
            usd={balanceTotal.usd}
            className="mt-2 block text-[2rem] font-semibold leading-none tracking-tight tabular-nums"
          />
          {cuenta && <p className="mt-2 text-xs text-subtle">Cuenta {cuenta.name}</p>}
        </Card>

        <Card className="p-4">
          <CardLabel>
            <TrendingUp className="size-3.5 text-income" aria-hidden />
            Ingresos
          </CardLabel>
          <Monto
            ars={ingresosDelMes.ars}
            usd={ingresosDelMes.usd}
            className="mt-2 block text-xl font-semibold tracking-tight tabular-nums text-income"
          />
          <p className="mt-1 text-[11px] text-subtle">Este mes</p>
        </Card>

        <Card className="p-4">
          <CardLabel>
            <TrendingDown className="size-3.5 text-expense" aria-hidden />
            Gastos
          </CardLabel>
          <Monto
            ars={gastosDelMes.ars}
            usd={gastosDelMes.usd}
            className="mt-2 block text-xl font-semibold tracking-tight tabular-nums text-expense"
          />
          <p className="mt-1 text-[11px] text-subtle">Este mes</p>
        </Card>
      </section>

      <SmartInput categorias={categorias.map((c) => ({ nombre: c.name, tipo: c.type }))} />

      <AnalyticsChart
        gastos={gastosParaGrafico}
        categorias={categorias.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      />

      <BudgetProgress categorias={presupuestos} faltaMigracion={faltaMigracion} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Movimientos recientes</h2>
        <TransactionList
          movimientos={movimientos.slice(0, 8)}
          categorias={categorias}
          bimoneda={bimoneda}
          vacio={
            <>
              Todavía no registraste movimientos.
              <br />
              Escribí o dictá uno arriba y la IA lo carga por vos.
            </>
          }
        />
      </section>
    </div>
  )
}
