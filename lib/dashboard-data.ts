import { obtenerCuentasPorMoneda, type Moneda } from './finanzas'
import { MONEDAS, totalizarPorMoneda } from './monedas'
import { obtenerCotizacionDelDia } from './rates'
import { createClient } from './supabase/server'
import {
  inicioDeLaVentanaDeDatos,
  rangoDelMesActual,
  type Categoria,
  type Transaccion,
} from './types'

export type MovimientoDeVentana = Pick<
  Transaccion,
  'amount' | 'currency' | 'amount_usd' | 'type' | 'date' | 'category_id'
>

export type Presupuesto = {
  id: string
  category_id: string
  currency: Moneda
  amount: number
}


/**
 * Carga única para todas las vistas privadas.
 *
 * ARS y USD son libros paralelos: los saldos vienen por cuenta (una por
 * moneda) y los totales se devuelven desagregados, nunca sumados.
 */
export async function cargarDatosDelDashboard() {
  const supabase = await createClient()

  const { desde, hasta } = rangoDelMesActual()
  const desdeVentana = inicioDeLaVentanaDeDatos()

  const [resCuentas, resCategorias, resRecientes, resVentana, resPresupuestos] = await Promise.all([
    obtenerCuentasPorMoneda(supabase),
    supabase.from('categories').select('*').order('name'),
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
    supabase.from('budgets').select('id, category_id, currency, amount'),
  ])

  // PGRST205 = la tabla budgets todavía no existe (falta migrations/002).
  const faltaMigracion =
    resPresupuestos.error?.code === 'PGRST205' || resPresupuestos.error?.code === '42P01'

  const errorCarga =
    resCuentas.error ??
    resCategorias.error?.message ??
    resRecientes.error?.message ??
    resVentana.error?.message ??
    (faltaMigracion ? null : (resPresupuestos.error?.message ?? null))

  const cotizacion = await obtenerCotizacionDelDia(supabase)

  const categorias = (resCategorias.data ?? []) as Categoria[]
  const movimientos = (resRecientes.data ?? []) as Transaccion[]
  const ventana = (resVentana.data ?? []) as MovimientoDeVentana[]
  const presupuestos = (resPresupuestos.data ?? []) as Presupuesto[]

  const delMes = ventana.filter((t) => t.date >= desde && t.date <= hasta)

  return {
    cuentas: resCuentas.cuentas,
    cotizacion,
    categorias,
    movimientos,
    ventana,
    delMes,
    presupuestos,
    // Un saldo por moneda: sumar pesos con dólares no significa nada.
    saldos: MONEDAS.map((moneda) => ({
      moneda,
      valor: Number(resCuentas.cuentas[moneda]?.balance ?? 0),
    })),
    ingresosDelMes: totalizarPorMoneda(delMes.filter((t) => t.type === 'INCOME')),
    gastosDelMes: totalizarPorMoneda(delMes.filter((t) => t.type === 'EXPENSE')),
    faltaMigracion,
    errorCarga,
  }
}
