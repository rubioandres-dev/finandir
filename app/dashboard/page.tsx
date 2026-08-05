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
import { GuideCarousel } from '@/components/guide-carousel'
import { MarketRatesCard } from '@/components/market-rates-card'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { getBestCardToPay } from '@/lib/card-optimizer'
import { esDeLaMoneda } from '@/lib/currency-mode'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { equivalenteAproximado } from '@/lib/monedas'
import { obtenerCotizacionesDelMercado } from '@/lib/rates'
import { createClient } from '@/lib/supabase/server'
import { hoyEnArgentina, type Moneda } from '@/lib/types'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Moneda activa del header: recorta todo lo que se muestra abajo.
  const { modo, monedas } = await cargarContextoDeMonedas()

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
  } = await cargarDatosDelDashboard(modo, monedas)

  // Recomendación de tarjeta: se calcula en el servidor y el widget solo muestra.
  const [{ tarjetas, cuentas }, cotizacionesDeMercado] = await Promise.all([
    cargarCuentasYDeudas(supabase, monedas),
    obtenerCotizacionesDelMercado(),
  ])

  const tarjetasDeLaMoneda = tarjetas.filter((t) => esDeLaMoneda(t, modo))
  const cuentasDeLaMoneda = cuentas.filter((c) => esDeLaMoneda(c, modo))

  const deudaPorTarjeta = new Map(
    cuentas
      .filter((c) => c.type === 'CREDIT_CARD')
      .map((c) => [c.id, Math.max(0, -Number(c.balance ?? 0))])
  )
  const recomendacion = getBestCardToPay(tarjetasDeLaMoneda, 0, modo, deudaPorTarjeta)

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
      // Una sola línea: la de la moneda activa. Mostrar el presupuesto en
      // dólares mientras se está mirando el libro en pesos era justo el ruido
      // que el modo global viene a sacar.
      lineas: [
        {
          moneda: modo,
          presupuesto: limitePorClave.get(`${c.id}:${modo}`) ?? null,
          gastado: gastado.get(`${c.id}:${modo}`) ?? 0,
        },
      ],
    }))

  const gastosParaGrafico = ventana
    .filter((t) => t.type === 'EXPENSE')
    .map((t) => ({
      amount: Number(t.amount),
      currency: t.currency,
      date: t.date,
      category_id: t.category_id,
    }))

  const equivalente = (t: { amount: number; currency: Moneda }) =>
    equivalenteAproximado(Number(t.amount), t.currency, cotizacion)

  // "Recientes" tiene que significar recientes. Las cuotas son filas con la
  // fecha del mes en que se pagan, así que el orden por fecha descendente
  // ponía arriba vencimientos que todavía no ocurrieron. Las futuras tienen su
  // propia pestaña en /dashboard/transactions.
  const hoy = hoyEnArgentina()
  const recientes = movimientos.filter((movimiento) => movimiento.date <= hoy).slice(0, 8)

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
        <Card glass className="glow-gold col-span-2 p-5">
          <CardLabel>
            <Wallet className="size-3.5 text-gold-leaf" aria-hidden />
            Balance total
          </CardLabel>
          <div className="mt-2.5">
            <MontoPorMoneda
              totales={saldos}
              className="font-display text-[2rem] font-bold leading-tight tracking-tighter tabular-nums text-gold-leaf"
              vacio="Sin movimientos todavía"
            />
          </div>
          {/* Filamento dorado al pie: cierra la card sin agregar otro borde. */}
          <div className="fire-gradient mt-4 h-px w-full opacity-40" aria-hidden />
        </Card>

        {/* `min-w-0` en las dos: sin él, un importe largo ensancha la columna
            del grid en vez de partirse, y la card de al lado se achica. */}
        <Card glass className="flex min-w-0 flex-col justify-between p-4">
          <CardLabel>
            <TrendingUp className="size-3.5 shrink-0 text-success-emerald" aria-hidden />
            Ingresos
          </CardLabel>
          <div className="mt-2 min-w-0">
            <MontoPorMoneda
              totales={ingresosDelMes}
              apilado
              className="font-display text-lg font-bold leading-tight tracking-tight tabular-nums text-success-emerald sm:text-xl"
              vacio="—"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">Este mes</p>
        </Card>

        <Card glass className="flex min-w-0 flex-col justify-between p-4">
          <CardLabel>
            <TrendingDown className="size-3.5 shrink-0 text-error-rose" aria-hidden />
            Gastos
          </CardLabel>
          <div className="mt-2 min-w-0">
            <MontoPorMoneda
              totales={gastosDelMes}
              apilado
              className="font-display text-lg font-bold leading-tight tracking-tight tabular-nums text-error-rose sm:text-xl"
              vacio="—"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">Este mes</p>
        </Card>
      </section>

      {/* --- Cotizaciones y guía: dos columnas, apiladas en mobile -------- */}
      <section className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
        <MarketRatesCard
          cotizaciones={cotizacionesDeMercado}
          fechaMep={cotizacion?.fecha ?? null}
        />
        <GuideCarousel />
      </section>

      <SmartCardSuggester
        recomendacion={recomendacion}
        hayTarjetas={tarjetasDeLaMoneda.length > 0}
      />

      <SmartInput
        categorias={categorias.map((c) => ({ nombre: c.name, tipo: c.type }))}
        cuentas={cuentasDeLaMoneda.map((c) => ({
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
          <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
            Movimientos recientes
          </h2>
          <Link
            href="/dashboard/transactions"
            className="text-xs font-medium text-gold-leaf hover:underline"
          >
            Ver todos
          </Link>
        </div>
        <TransactionList
          movimientos={recientes}
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
