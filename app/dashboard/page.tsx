import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { AnalyticsChart } from '@/components/analytics-chart'
import { BudgetGoals, type PresupuestoDeObjetivo } from '@/components/budget-goals'
import { FlowCards } from '@/components/flow-cards'
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
import { cargarObjetivos } from '@/lib/goals-service'
import { crearTraductor } from '@/lib/i18n'
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
  const { modo, monedas, idioma } = await cargarContextoDeMonedas()
  const tr = crearTraductor(idioma)

  const {
    cotizacion,
    categorias,
    movimientos,
    ventana,
    delMes,
    saldos,
    ingresosDelMes,
    gastosDelMes,
    errorCarga,
  } = await cargarDatosDelDashboard(modo, monedas)

  // Recomendación de tarjeta: se calcula en el servidor y el widget solo muestra.
  const [{ tarjetas, cuentas }, cotizacionesDeMercado, { objetivos }] = await Promise.all([
    cargarCuentasYDeudas(supabase, monedas),
    obtenerCotizacionesDelMercado(),
    cargarObjetivos(supabase),
  ])

  const tarjetasDeLaMoneda = tarjetas.filter((t) => esDeLaMoneda(t, modo))
  const cuentasDeLaMoneda = cuentas.filter((c) => esDeLaMoneda(c, modo))

  const deudaPorTarjeta = new Map(
    cuentas
      .filter((c) => c.type === 'CREDIT_CARD')
      .map((c) => [c.id, Math.max(0, -Number(c.balance ?? 0))])
  )
  const recomendacion = getBestCardToPay(tarjetasDeLaMoneda, 0, modo, deudaPorTarjeta)

  // Gasto del mes por categoría, ya recortado a la moneda activa por
  // `cargarDatosDelDashboard`: el Home muestra un solo libro.
  const gastado = new Map<string, number>()
  for (const movimiento of delMes) {
    if (movimiento.type !== 'EXPENSE' || !movimiento.category_id) continue
    gastado.set(
      movimiento.category_id,
      (gastado.get(movimiento.category_id) ?? 0) + Number(movimiento.amount)
    )
  }

  const categoriaPorId = new Map(categorias.map((c) => [c.id, c]))

  // Los presupuestos del Home salen de los OBJETIVOS de tipo CATEGORY_BUDGET,
  // no de la tabla `budgets`. Ver la nota de `components/budget-goals.tsx`:
  // dos fuentes para el mismo techo garantizaban que se contradijeran, y sólo
  // los objetivos suman XP al cumplirse.
  const presupuestosDeObjetivos: PresupuestoDeObjetivo[] = objetivos
    .filter((o) => o.type === 'CATEGORY_BUDGET' && o.category_id && o.currency === modo)
    .flatMap((objetivo) => {
      const categoria = categoriaPorId.get(objetivo.category_id!)
      if (!categoria) return []

      return [
        {
          id: objetivo.id,
          categoriaId: categoria.id,
          nombre: categoria.name,
          icono: categoria.icon,
          color: categoria.color,
          gastado: gastado.get(categoria.id) ?? 0,
          limite: objetivo.target_value,
          moneda: objetivo.currency,
        },
      ]
    })

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
          {tr('dashboard.errorCarga', { error: errorCarga })}
        </p>
      )}

      {/* --- Resumen: una línea por moneda, nunca sumadas ------------------ */}
      <section className="grid grid-cols-2 gap-3">
        <Card glass className="glow-gold col-span-2 p-5">
          <CardLabel>
            <Wallet className="size-3.5 text-gold-leaf" aria-hidden />
            {tr('dashboard.balance')}
          </CardLabel>
          <div className="mt-2.5">
            <MontoPorMoneda
              totales={saldos}
              className="font-display text-[2rem] font-bold leading-tight tracking-tighter tabular-nums text-gold-leaf"
              vacio={tr('dashboard.sinMovimientos')}
            />
          </div>
          {/* Filamento dorado al pie: cierra la card sin agregar otro borde. */}
          <div className="fire-gradient mt-4 h-px w-full opacity-40" aria-hidden />
        </Card>

        {/* Ingresos y gastos en la moneda ACTIVA, no en las dos a la vez.
            Mostrar ARS y USD apilados en la misma card obligaba a leer cuatro
            números para responder "cuánto gasté", y ninguno de los dos totales
            era comparable con el otro. El selector del header ya elige libro:
            estas cards lo respetan como el resto de la app. */}
        <FlowCards
          ingresos={ingresosDelMes.find((i) => i.moneda === modo)?.valor ?? 0}
          gastos={gastosDelMes.find((g) => g.moneda === modo)?.valor ?? 0}
          moneda={modo}
        />
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

      <BudgetGoals presupuestos={presupuestosDeObjetivos} />

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
            {tr('dashboard.recientes')}
          </h2>
          <Link
            href="/dashboard/transactions"
            className="text-xs font-medium text-gold-leaf hover:underline"
          >
            {tr('dashboard.verTodos')}
          </Link>
        </div>
        <TransactionList
          movimientos={recientes}
          categorias={categorias}
          equivalente={equivalente}
          vacio={
            <>
              {tr('dashboard.sinRegistrar')}
              <br />
              {tr('dashboard.sinRegistrarPista')}
            </>
          }
        />
      </section>
    </div>
  )
}
