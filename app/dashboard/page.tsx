import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ArrowLeftRight, TrendingDown, TrendingUp } from 'lucide-react'
import { AnalyticsChart } from '@/components/analytics-chart'
import { BudgetProgress, type PresupuestoDeCategoria } from '@/components/budget-progress'
import { Monto } from '@/components/monto'
import { SmartInput } from '@/components/smart-input'
import { iconoDeCategoria } from '@/lib/category-icons'
import { obtenerOCrearCuentaPrincipal } from '@/lib/finanzas'
import { montosDe, obtenerCotizacionDelDia, sumarMontos } from '@/lib/rates'
import { createClient } from '@/lib/supabase/server'
import {
  ETIQUETA_TIPO,
  formatearFecha,
  inicioDeLaVentanaDeDatos,
  rangoDelMesActual,
  type Categoria,
  type Transaccion,
} from '@/lib/types'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Garantiza que exista al menos una cuenta antes de mostrar nada.
  const { cuenta, error: errorCuenta } = await obtenerOCrearCuentaPrincipal(supabase, user.id)

  const { desde, hasta } = rangoDelMesActual()
  // Una sola ventana de datos alimenta el resumen del mes, el gráfico
  // (que filtra en cliente) y los presupuestos.
  const desdeVentana = inicioDeLaVentanaDeDatos()

  const [resCuentas, resCategorias, resRecientes, resVentana] = await Promise.all([
    supabase.from('accounts').select('balance'),
    // monthly_budget puede no existir todavía; ver el fallback más abajo.
    supabase.from('categories').select('*, monthly_budget').order('name'),
    supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(25),
    supabase
      .from('transactions')
      .select('amount, currency, amount_usd, type, date, category_id')
      .gte('date', desdeVentana),
  ])

  const cotizacion = await obtenerCotizacionDelDia(supabase)

  // 42703 = la columna monthly_budget no existe: falta correr la migración.
  // En vez de romper el dashboard entero, reintentamos sin ella.
  const faltaMigracion = resCategorias.error?.code === '42703'
  const categoriasFallback = faltaMigracion
    ? await supabase.from('categories').select('*').order('name')
    : null

  const errorCarga =
    errorCuenta ??
    resCuentas.error?.message ??
    (faltaMigracion ? categoriasFallback?.error?.message : resCategorias.error?.message) ??
    resRecientes.error?.message ??
    resVentana.error?.message ??
    null

  const categorias = ((categoriasFallback?.data ?? resCategorias.data ?? []) as Categoria[]).map(
    (c) => ({ ...c, monthly_budget: c.monthly_budget ?? null })
  )
  const recientes = (resRecientes.data ?? []) as Transaccion[]
  const ventana = (resVentana.data ?? []) as Pick<
    Transaccion,
    'amount' | 'currency' | 'amount_usd' | 'type' | 'date' | 'category_id'
  >[]

  /** Cada movimiento en sus dos monedas, para que el toggle sea instantáneo. */
  const bimoneda = (t: {
    amount: number
    currency?: 'ARS' | 'USD' | null
    amount_usd?: number | null
  }) => montosDe(Number(t.amount), t.currency ?? 'ARS', t.amount_usd ?? null, cotizacion)

  const delMes = ventana.filter((t) => t.date >= desde && t.date <= hasta)

  // El saldo de la cuenta lo mantiene un trigger que suma `amount` sin mirar
  // la moneda; solo es fiable mientras todo esté en pesos.
  // Ver migrations/003_saldo_multimoneda.sql
  const balanceArs = (resCuentas.data ?? []).reduce(
    (total, fila) => total + Number(fila.balance ?? 0),
    0
  )
  const balanceTotal = {
    ars: balanceArs,
    usd: cotizacion ? Math.round((balanceArs / cotizacion.venta) * 100) / 100 : null,
  }

  const ingresosDelMes = sumarMontos(
    delMes.filter((t) => t.type === 'INCOME').map(bimoneda)
  )
  const gastosDelMes = sumarMontos(delMes.filter((t) => t.type === 'EXPENSE').map(bimoneda))

  const porId = new Map(categorias.map((c) => [c.id, c]))

  // Gasto del mes por categoría, para las barras de presupuesto.
  // Los presupuestos se definen en pesos, así que acá se acumula en ARS.
  const gastadoPorCategoria = new Map<string, number>()
  for (const movimiento of delMes) {
    if (movimiento.type !== 'EXPENSE' || !movimiento.category_id) continue
    const montos = bimoneda(movimiento)
    gastadoPorCategoria.set(
      movimiento.category_id,
      (gastadoPorCategoria.get(movimiento.category_id) ?? 0) + (montos.ars ?? 0)
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

  // El gráfico compara categorías entre sí: se alimenta en pesos, la unidad
  // en la que están definidos los presupuestos y la mayoría de los gastos.
  const gastosParaGrafico = ventana
    .filter((t) => t.type === 'EXPENSE')
    .map((t) => ({
      amount: bimoneda(t).ars ?? 0,
      date: t.date,
      category_id: t.category_id,
    }))

  return (
    <div className="flex flex-col gap-6">
      {errorCarga && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300"
        >
          Hubo un problema al cargar tus datos: {errorCarga}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3">
        <div className="col-span-2 rounded-xl border border-black/8 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
            Balance total
          </p>
          <Monto
            ars={balanceTotal.ars}
            usd={balanceTotal.usd}
            className="mt-1.5 block text-3xl font-semibold tabular-nums"
          />
          {cuenta && (
            <p className="mt-1 text-xs text-black/40 dark:text-white/40">Cuenta {cuenta.name}</p>
          )}
        </div>

        <div className="rounded-xl border border-black/8 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
            <TrendingUp className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Ingresos del mes
          </p>
          <Monto
            ars={ingresosDelMes.ars}
            usd={ingresosDelMes.usd}
            className="mt-1.5 block text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400"
          />
        </div>

        <div className="rounded-xl border border-black/8 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
            <TrendingDown className="size-3.5 text-red-500" aria-hidden />
            Gastos del mes
          </p>
          <Monto
            ars={gastosDelMes.ars}
            usd={gastosDelMes.usd}
            className="mt-1.5 block text-xl font-semibold tabular-nums text-red-600 dark:text-red-400"
          />
        </div>
      </section>

      <SmartInput
        categorias={categorias.map((c) => ({ nombre: c.name, tipo: c.type }))}
      />

      <AnalyticsChart
        gastos={gastosParaGrafico}
        categorias={categorias.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
      />

      <BudgetProgress categorias={presupuestos} faltaMigracion={faltaMigracion} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Movimientos recientes</h2>

        {recientes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/12 px-4 py-8 text-center text-sm text-black/45 dark:border-white/15 dark:text-white/45">
            Todavía no registraste movimientos.
            <br />
            Escribí uno arriba y la IA lo carga por vos.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/[0.07] overflow-hidden rounded-xl border border-black/8 dark:divide-white/8 dark:border-white/10">
            {recientes.map((transaccion) => {
              const categoria = transaccion.category_id
                ? porId.get(transaccion.category_id)
                : undefined
              const Icono = transaccion.type === 'TRANSFER'
                ? ArrowLeftRight
                : iconoDeCategoria(categoria?.icon)
              const esIngreso = transaccion.type === 'INCOME'

              return (
                <li key={transaccion.id} className="flex items-center gap-3 px-3.5 py-3">
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-full"
                    style={{
                      backgroundColor: `${categoria?.color ?? '#64748B'}1F`,
                      color: categoria?.color ?? '#64748B',
                    }}
                  >
                    <Icono className="size-4" aria-hidden />
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {transaccion.description || ETIQUETA_TIPO[transaccion.type]}
                    </span>
                    <span className="truncate text-xs text-black/45 dark:text-white/45">
                      {categoria?.name ?? ETIQUETA_TIPO[transaccion.type]} ·{' '}
                      {formatearFecha(transaccion.date)}
                    </span>
                  </div>

                  <span className="flex shrink-0 flex-col items-end">
                    <Monto
                      {...bimoneda(transaccion)}
                      signo={esIngreso ? '+' : '−'}
                      className={`text-sm font-semibold tabular-nums ${
                        esIngreso ? 'text-emerald-600 dark:text-emerald-400' : ''
                      }`}
                    />
                    {transaccion.currency === 'USD' && (
                      <span className="text-[10px] font-medium text-black/35 dark:text-white/35">
                        cargado en USD
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
