import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AnalyticsChart } from '@/components/analytics-chart'
import { BalanceOverviewCard } from '@/components/balance-overview-card'
import { BudgetGoals } from '@/components/budget-goals'
import { FlowCards } from '@/components/flow-cards'
import { SmartCardSuggester } from '@/components/smart-card-suggester'
import { SmartInput } from '@/components/smart-input'
import { TransactionList } from '@/components/transaction-list'
import { GuideCarousel } from '@/components/guide-carousel'
import { MarketRatesCard } from '@/components/market-rates-card'
import { MonthlyFlowChart } from '@/components/monthly-flow-chart'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { resumirBalance } from '@/lib/balance-overview'
import { getBestCardToPay } from '@/lib/card-optimizer'
import { calcularAvances } from '@/lib/category-budgets-service'
import { cargarCompromisos } from '@/lib/commitments-service'
import { esDeLaMoneda } from '@/lib/currency-mode'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { obtenerMapaDeCambio } from '@/lib/exchange'
import { crearTraductor } from '@/lib/i18n'
import { cargarInversiones } from '@/lib/investments-service'
import { moduloActivo } from '@/lib/modules'
import { equivalenteAproximado } from '@/lib/monedas'
import { cargarFlujoMensual } from '@/lib/monthly-flow'
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
  const { modo, monedas, idioma, locale, modulos } = await cargarContextoDeMonedas()
  const tr = crearTraductor(idioma)

  const {
    cotizacion,
    categorias,
    movimientos,
    ventana,
    delMes,
    presupuestos,
    ingresosDelMes,
    gastosDelMes,
    errorCarga,
  } = await cargarDatosDelDashboard(modo, monedas)

  const hoy = hoyEnArgentina()

  // Recomendación de tarjeta: se calcula en el servidor y el widget solo muestra.
  const [
    { tarjetas, cuentas, patrimonio },
    cotizacionesDeMercado,
    { resumen: carteraDeInversiones },
    { curva },
    { serie: flujoMensual },
  ] = await Promise.all([
    cargarCuentasYDeudas(supabase, monedas),
    obtenerCotizacionesDelMercado(),
    cargarInversiones(supabase, monedas),
    cargarCompromisos(supabase, hoy),
    cargarFlujoMensual(supabase, modo, hoy),
  ])

  // El mapa va después: reusa el MEP que `cargarDatosDelDashboard` ya resolvió
  // en vez de volver a pedirlo.
  const { mapa } = await obtenerMapaDeCambio(supabase, monedas, cotizacion?.venta ?? null)

  // Las tres capas del balance, unificadas a la divisa ACTIVA del header —no a
  // la principal del perfil, como hace el consolidado—: esta card acompaña al
  // selector de arriba y tiene que responder en la misma moneda que él.
  const balance = resumirBalance({
    patrimonio,
    inversiones: carteraDeInversiones,
    monedas,
    destino: modo,
    mapa,
    cotizacion,
    // Primer punto de la curva: lo que vence de hoy a fin de mes.
    cuotasDelMes: curva[0]?.porMoneda ?? [],
  })

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

  // Los presupuestos salen de `category_budgets`, la fuente única desde la 013.
  // `cargarDatosDelDashboard` ya los recortó a la moneda activa.
  const presupuestosDeObjetivos = calcularAvances(presupuestos, categorias, gastado)

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
  const recientes = movimientos.filter((movimiento) => movimiento.date <= hoy).slice(0, 8)

  return (
    // `ancho-dashboard` es lo que ensancha el `<main>` del layout en escritorio,
    // vía `main:has(> .ancho-dashboard)` en globals.css. Es la única página que
    // lo pide: el resto se lee mejor en una columna angosta.
    <div className="ancho-dashboard flex flex-col gap-5">
      {errorCarga && (
        <p
          role="alert"
          className="rounded-2xl border border-expense/30 bg-expense/10 px-4 py-3 text-sm text-expense"
        >
          {tr('dashboard.errorCarga', { error: errorCarga })}
        </p>
      )}

      {/*
        DOS COLUMNAS EN ESCRITORIO, UNA EN MOBILE

        El reparto es 65/35 (`lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]`).
        Los `minmax(0, …)` no son decorativos: sin ellos, una fracción de grid
        tiene mínimo `auto`, y el gráfico de recharts —que mide su contenedor—
        empuja la columna hasta desbordar la grilla en lugar de encogerse.

        En mobile la grilla es de una sola columna y el orden del DOM manda, que
        es el mismo orden de lectura de siempre: balance, flujo, entrada rápida,
        recientes. Por eso la columna derecha va DESPUÉS en el markup.
      */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
        {/* --- Columna principal ---------------------------------------- */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* Reemplaza al "Balance total" viejo, que mostraba los saldos crudos
              de las cuentas: mezclaba plata disponible con deuda de tarjeta y,
              con varias divisas, era una lista que el ojo terminaba sumando
              aunque no fuera sumable. */}
          <BalanceOverviewCard
            resumen={balance}
            locale={locale}
            idioma={idioma}
            mostrarInversiones={moduloActivo(modulos, 'investments')}
            mostrarDeudas={moduloActivo(modulos, 'debts')}
          />

          <section className="grid grid-cols-2 gap-3">
            {/* Ingresos y gastos en la moneda ACTIVA, no en las dos a la vez.
                Mostrar ARS y USD apilados en la misma card obligaba a leer
                cuatro números para responder "cuánto gasté", y ninguno de los
                dos totales era comparable con el otro. */}
            <FlowCards
              ingresos={ingresosDelMes.find((i) => i.moneda === modo)?.valor ?? 0}
              gastos={gastosDelMes.find((g) => g.moneda === modo)?.valor ?? 0}
              moneda={modo}
            />
          </section>

          <MonthlyFlowChart serie={flujoMensual} moneda={modo} />

          {/* El `data-tour` va en un envoltorio y no adentro del componente:
              `SmartCardSuggester` devuelve dos árboles distintos según haya
              tarjetas o no, y el ancla tiene que existir en los dos casos. */}
          <div data-tour="smart-spend">
            <SmartCardSuggester
              recomendacion={recomendacion}
              hayTarjetas={tarjetasDeLaMoneda.length > 0}
            />
          </div>

          <SmartInput
            categorias={categorias.map((c) => ({ nombre: c.name, tipo: c.type }))}
            cuentas={cuentasDeLaMoneda.map((c) => ({
              id: c.id,
              name: c.name,
              type: c.type,
              currency: c.currency,
            }))}
          />

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

        {/* --- Columna lateral ------------------------------------------ */}
        {/* `lg:sticky` para que los atajos y las cotizaciones sigan a la vista
            mientras se scrollea el historial de la izquierda, que es mucho más
            largo. `top-28` deja pasar el header sticky y su barra de tier. */}
        <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-28">
          <AnalyticsChart
            gastos={gastosParaGrafico}
            categorias={categorias.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
          />

          <BudgetGoals presupuestos={presupuestosDeObjetivos} />

          <MarketRatesCard
            cotizaciones={cotizacionesDeMercado}
            fechaMep={cotizacion?.fecha ?? null}
          />

          <GuideCarousel />
        </aside>
      </div>
    </div>
  )
}
