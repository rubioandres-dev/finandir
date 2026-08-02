import { obtenerOCrearCuentaPrincipal } from './finanzas'
import { montosDe, obtenerCotizacionDelDia, type Cotizacion } from './rates'
import { createClient } from './supabase/server'
import { inicioDeLaVentanaDeDatos, rangoDelMesActual, type Categoria, type Transaccion } from './types'

export type MovimientoDeVentana = Pick<
  Transaccion,
  'amount' | 'currency' | 'amount_usd' | 'type' | 'date' | 'category_id'
>

/**
 * Carga única para todas las vistas privadas: una sola ventana de datos
 * alimenta el resumen del mes, el gráfico, los presupuestos y la lista.
 */
export async function cargarDatosDelDashboard(userId: string) {
  const supabase = await createClient()

  const { cuenta, error: errorCuenta } = await obtenerOCrearCuentaPrincipal(supabase, userId)
  const { desde, hasta } = rangoDelMesActual()
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
      .limit(100),
    supabase
      .from('transactions')
      .select('amount, currency, amount_usd, type, date, category_id')
      .gte('date', desdeVentana),
  ])

  // 42703 = la columna monthly_budget no existe: falta correr la migración.
  // En vez de romper la vista entera, reintentamos sin ella.
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

  const cotizacion = await obtenerCotizacionDelDia(supabase)

  const categorias = ((categoriasFallback?.data ?? resCategorias.data ?? []) as Categoria[]).map(
    (c) => ({ ...c, monthly_budget: c.monthly_budget ?? null })
  )
  const movimientos = (resRecientes.data ?? []) as Transaccion[]
  const ventana = (resVentana.data ?? []) as MovimientoDeVentana[]

  return {
    cuenta,
    cotizacion,
    categorias,
    movimientos,
    ventana,
    delMes: ventana.filter((t) => t.date >= desde && t.date <= hasta),
    balanceArs: (resCuentas.data ?? []).reduce((total, fila) => total + Number(fila.balance ?? 0), 0),
    faltaMigracion,
    errorCarga,
    bimoneda: crearConversor(cotizacion),
  }
}

/** Convierte un movimiento a sus dos monedas para que el toggle sea instantáneo. */
export function crearConversor(cotizacion: Cotizacion | null) {
  return (t: { amount: number; currency?: 'ARS' | 'USD' | null; amount_usd?: number | null }) =>
    montosDe(Number(t.amount), t.currency ?? 'ARS', t.amount_usd ?? null, cotizacion)
}
