import { esDeLaMoneda } from './currency-mode'
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
 *
 * `moneda` es el modo global del header. Cuando viene, TODO lo que devuelve
 * esta función queda restringido a esa moneda: movimientos, ventana del
 * gráfico, presupuestos y saldos. El filtro va acá y no en cada vista para que
 * no haya forma de que una se olvide y muestre las dos monedas mezcladas.
 *
 * Sin `moneda` devuelve los dos libros, que es lo que necesita la vista
 * consolidada.
 */
export async function cargarDatosDelDashboard(moneda?: Moneda) {
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

  // El modo del header recorta todo desde acá.
  const deLaMoneda = <T extends { currency?: string | null }>(filas: T[]) =>
    moneda ? filas.filter((fila) => esDeLaMoneda(fila, moneda)) : filas

  const movimientos = deLaMoneda((resRecientes.data ?? []) as Transaccion[])
  const ventana = deLaMoneda((resVentana.data ?? []) as MovimientoDeVentana[])
  const presupuestos = deLaMoneda((resPresupuestos.data ?? []) as Presupuesto[])

  const delMes = ventana.filter((t) => t.date >= desde && t.date <= hasta)

  const monedasVisibles = moneda ? [moneda] : MONEDAS

  return {
    cuentas: resCuentas.cuentas,
    cotizacion,
    categorias,
    movimientos,
    ventana,
    delMes,
    presupuestos,
    /** Monedas que las vistas deben mostrar: una en modo filtrado, las dos si no. */
    monedasVisibles,
    // Un saldo por moneda: sumar pesos con dólares no significa nada.
    saldos: monedasVisibles.map((visible) => ({
      moneda: visible,
      valor: Number(resCuentas.cuentas[visible]?.balance ?? 0),
    })),
    ingresosDelMes: totalizarPorMoneda(delMes.filter((t) => t.type === 'INCOME')),
    gastosDelMes: totalizarPorMoneda(delMes.filter((t) => t.type === 'EXPENSE')),
    faltaMigracion,
    errorCarga,
  }
}
