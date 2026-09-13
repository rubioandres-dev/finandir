import type { PresupuestoDeCategoria } from './category-budgets-service'
import { movimientosDesde, ultimosMovimientos } from './almacen/consultas'
import type { CategoriaGuardada } from './almacen/documentos'
import type { Libro } from './almacen/libro'
import { esDeLaMoneda } from './currency-mode'
import { obtenerCuentasPorMoneda, type Moneda } from './finanzas'
import { MONEDAS_POR_DEFECTO, totalizarPorMoneda } from './monedas'
import { obtenerCotizacionDelDia } from './rates'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  inicioDeLaVentanaDeDatos,
  rangoDelMesActual,
  type Categoria,
  type Cuenta,
  type Transaccion,
} from './types'

export type MovimientoDeVentana = Pick<
  Transaccion,
  'amount' | 'currency' | 'amount_usd' | 'type' | 'date' | 'category_id'
>

/**
 * Alias del tipo de `category-budgets-service`.
 *
 * Se conserva el nombre `Presupuesto` para no tocar las vistas que ya lo
 * importan de acá; la forma es la misma desde que la 013 unificó la fuente.
 */
export type Presupuesto = PresupuestoDeCategoria


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
 * Sin `moneda` devuelve todos los libros, que es lo que necesita la vista
 * consolidada.
 *
 * `monedasDelPerfil` son las divisas que el usuario eligió: definen qué
 * columnas existen cuando NO hay filtro, para que una divisa recién agregada
 * aparezca en cero en vez de no aparecer.
 */
export async function cargarDatosDelDashboard(
  libro: Libro,
  supabase: SupabaseClient,
  moneda?: Moneda,
  monedasDelPerfil: Moneda[] = MONEDAS_POR_DEFECTO
) {
  const { desde, hasta } = rangoDelMesActual()
  const desdeVentana = inicioDeLaVentanaDeDatos()

  let resCuentas: { cuentas: Record<string, Cuenta>; error: string | null } = {
    cuentas: {},
    error: null,
  }
  let guardadas: CategoriaGuardada[] = []
  let recientes: Transaccion[] = []
  let deLaVentana: MovimientoDeVentana[] = []
  let errorCarga: string | null = null

  try {
    ;[resCuentas, guardadas, recientes, deLaVentana] = await Promise.all([
      obtenerCuentasPorMoneda(libro),
      libro.leer('categorias'),
      // Los cien ultimos: `ultimosMovimientos` recorre los anios de atras para
      // adelante y corta al llegar al tope, en vez de bajar toda la historia.
      ultimosMovimientos(libro, 100),
      // Sin tope superior a proposito: la ventana incluye las cuotas futuras.
      movimientosDesde(libro, desdeVentana) as Promise<MovimientoDeVentana[]>,
    ])
    errorCarga = resCuentas.error
  } catch (error) {
    errorCarga = error instanceof Error ? error.message : 'No se pudieron leer los datos.'
  }

  /**
   * Desde la 013 los presupuestos salen de `category_budgets`, y ahora viajan
   * EMBEBIDOS en su categoria — asi que ya no hay una lectura propia que pueda
   * fallar con "falta la tabla".
   *
   * Queda siempre en false y el aviso de migracion pendiente desaparece. Es una
   * perdida chica y deliberada: la alternativa era filtrar un concepto
   * relacional ("esta sub-tabla no existe") hacia una interface que tambien
   * sirve a un almacen cifrado, donde no significa nada.
   */
  const faltaMigracion = false

  const cotizacion = await obtenerCotizacionDelDia(supabase)

  const categorias = guardadas as Categoria[]

  // El modo del header recorta todo desde acá.
  const deLaMoneda = <T extends { currency?: string | null }>(filas: T[]) =>
    moneda ? filas.filter((fila) => esDeLaMoneda(fila, moneda)) : filas

  const movimientos = deLaMoneda(recientes)
  const ventana = deLaMoneda(deLaVentana)
  // Vienen adentro de cada categoria: una sola lectura en vez de dos.
  const presupuestos = deLaMoneda(guardadas.flatMap((c) => c.presupuestos))

  const delMes = ventana.filter((t) => t.date >= desde && t.date <= hasta)

  const monedasVisibles = moneda ? [moneda] : monedasDelPerfil

  return {
    cuentas: resCuentas.cuentas,
    cotizacion,
    categorias,
    movimientos,
    ventana,
    delMes,
    presupuestos,
    /** Monedas a mostrar: una en modo filtrado, las del perfil si no hay filtro. */
    monedasVisibles,
    // Un saldo por moneda: sumar pesos con dólares no significa nada.
    saldos: monedasVisibles.map((visible) => ({
      moneda: visible,
      valor: Number(resCuentas.cuentas[visible]?.balance ?? 0),
    })),
    ingresosDelMes: totalizarPorMoneda(
      delMes.filter((t) => t.type === 'INCOME'),
      monedasVisibles
    ),
    gastosDelMes: totalizarPorMoneda(
      delMes.filter((t) => t.type === 'EXPENSE'),
      monedasVisibles
    ),
    faltaMigracion,
    errorCarga,
  }
}
