import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { AnalyticsChart } from '@/components/analytics-chart'
import { BudgetProgress, type PresupuestoDeCategoria } from '@/components/budget-progress'
import { MontoPorMoneda } from '@/components/monto'
import { SmartCardSuggester } from '@/components/smart-card-suggester'
import { SmartInput } from '@/components/smart-input'
import { TransactionList } from '@/components/transaction-list'
import { Card, CardLabel } from '@/components/ui/card'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { getBestCardToPay } from '@/lib/card-optimizer'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { MONEDAS, equivalenteAproximado } from '@/lib/monedas'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const {
    cotizacion,
    categorias,
    movimientos,
    ventana,
    delMes,
    presupuestos,
    saldos,
    ingresosDelMes,
    gastosDelMes,
    faltaMigracion,
    errorCarga,
  } = await cargarDatosDelDashboard()

  // Recomendación de tarjeta: se calcula en el servidor y el widget solo muestra.
  const { tarjetas, cuentas } = await cargarCuentasYDeudas(supabase)
  const deudaPorTarjeta = new Map(
    cuentas
      .filter((c) => c.type === 'CREDIT_CARD')
      .map((c) => [c.id, Math.max(0, -Number(c.balance ?? 0))])
  )
  const recomendacion = getBestCardToPay(tarjetas, 0, 'ARS', deudaPorTarjeta)

  // Gasto del mes por categoría y moneda: cada moneda se compara solo con su
  // propio presupuesto.
  const gastado = new Map<string, number>()
  for (const movimiento of delMes) {
    if (movimiento.type !== 'EXPENSE' || !movimiento.category_id) continue
    const clave = `${movimiento.category_id}:${movimiento.currency}`
    gastado.set(clave, (gastado.get(clave) ?? 0) + Number(movimiento.amount))
  }

  const limitePorClave = new Map(
    presupuestos.map((p) => [`${p.category_id}:${p.currency}`, Number(p.amount)])
  )

  const presupuestosPorCategoria: PresupuestoDeCategoria[] = categorias
    .filter((c) => c.type === 'EXPENSE')
    .map((c) => ({
      id: c.id,
      nombre: c.name,
      icono: c.icon,
      color: c.color,
      lineas: MONEDAS.map((moneda) => ({
        moneda,
        presupuesto: limitePorClave.get(`${c.id}:${moneda}`) ?? null,
        gastado: gastado.get(`${c.id}:${moneda}`) ?? 0,
      })),
    }))

  const gastosParaGrafico = ventana
    .filter((t) => t.type === 'EXPENSE')
    .map((t) => ({
      amount: Number(t.amount),
      currency: t.currency,
      date: t.date,
      category_id: t.category_id,
    }))

  const equivalente = (t: { amount: number; currency: 'ARS' | 'USD' }) =>
    equivalenteAproximado(Number(t.amount), t.currency, cotizacion)

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

      {/* --- Resumen: una línea por moneda, nunca sumadas ------------------ */}
      <section className="grid grid-cols-2 gap-3">
        <Card className="col-span-2 p-4">
          <CardLabel>
            <Wallet className="size-3.5" aria-hidden />
            Balance
          </CardLabel>
          <MontoPorMoneda
            totales={saldos}
            className="text-[1.75rem] font-semibold leading-tight tracking-tight tabular-nums"
            vacio="Sin movimientos todavía"
          />
        </Card>

        <Card className="p-4">
          <CardLabel>
            <TrendingUp className="size-3.5 text-income" aria-hidden />
            Ingresos
          </CardLabel>
          <div className="mt-2">
            <MontoPorMoneda
              totales={ingresosDelMes}
              className="text-lg font-semibold tracking-tight tabular-nums text-income"
              vacio="—"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">Este mes</p>
        </Card>

        <Card className="p-4">
          <CardLabel>
            <TrendingDown className="size-3.5 text-expense" aria-hidden />
            Gastos
          </CardLabel>
          <div className="mt-2">
            <MontoPorMoneda
              totales={gastosDelMes}
              className="text-lg font-semibold tracking-tight tabular-nums text-expense"
              vacio="—"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">Este mes</p>
        </Card>
      </section>

      <SmartCardSuggester recomendacion={recomendacion} hayTarjetas={tarjetas.length > 0} />

      <SmartInput
        categorias={categorias.map((c) => ({ nombre: c.name, tipo: c.type }))}
        cuentas={cuentas.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          currency: c.currency,
        }))}
      />

      <AnalyticsChart
        gastos={gastosParaGrafico}
        categorias={categorias.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      />

      <BudgetProgress categorias={presupuestosPorCategoria} faltaMigracion={faltaMigracion} />

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight">Movimientos recientes</h2>
          <Link
            href="/dashboard/transactions"
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver todos
          </Link>
        </div>
        <TransactionList
          movimientos={movimientos.slice(0, 8)}
          categorias={categorias}
          equivalente={equivalente}
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
