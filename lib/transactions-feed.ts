import type { SupabaseClient } from '@supabase/supabase-js'
import { esDeLaMoneda } from './currency-mode'
import { rangoDelMesActual, type Moneda, type Transaccion } from './types'

/**
 * El feed de movimientos, partido en tres períodos.
 *
 * POR QUÉ TRES CONSULTAS Y NO "LOS ÚLTIMOS 100"
 *
 * Las cuotas son filas reales con la fecha del mes en que se pagan, así que un
 * `order by date desc limit 100` arranca por las cuotas de meses que todavía
 * no llegaron. Con dos o tres planes de 12 cuotas abiertos, el historial se
 * llenaba de vencimientos futuros y el gasto de ayer quedaba abajo. De ahí que
 * el mes en curso se consulte aparte y sea lo que se ve por defecto.
 *
 * LA TERCERA PESTAÑA NO ESTABA PEDIDA, y va igual: con solo "mes actual" y
 * "cuotas futuras", todo lo de meses anteriores quedaba inalcanzable desde el
 * historial. Un historial que no deja ver el historial es un bug, no una
 * simplificación.
 */

/** Un mes de vencimientos, con sus cuotas. */
export type MesDeVencimientos = {
  /** "2026-09" */
  clave: string
  /** "septiembre 2026" */
  etiqueta: string
  movimientos: Transaccion[]
}

export type FeedDeMovimientos = {
  delMes: Transaccion[]
  /** Agrupadas por mes de vencimiento, del más cercano al más lejano. */
  futuras: MesDeVencimientos[]
  /** Cuántas filas futuras hay en total, para el contador de la pestaña. */
  totalFuturas: number
  anteriores: Transaccion[]
  error: string | null
}

/** Cuántos movimientos viejos se traen. Más que eso ya es un export, no un feed. */
const TOPE_ANTERIORES = 100

/**
 * "2026-09" -> "septiembre 2026".
 *
 * `timeZone: 'UTC'` obligatorio: el Date se arma con `Date.UTC` en el día 1, y
 * formatearlo en la zona local lo corre al mes anterior. Ver la nota en
 * `formatearFecha`, que tenía el mismo problema.
 */
function etiquetaDeMes(clave: string): string {
  const [anio, mes] = clave.split('-').map(Number)
  const nombre = new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(anio, mes - 1, 1)))
  return `${nombre} ${anio}`
}

/** Exportada para poder verificar el agrupamiento y el orden sin base de datos. */
export function agruparPorMes(movimientos: Transaccion[]): MesDeVencimientos[] {
  const porClave = new Map<string, Transaccion[]>()

  for (const movimiento of movimientos) {
    const clave = movimiento.date.slice(0, 7)
    const grupo = porClave.get(clave)
    if (grupo) grupo.push(movimiento)
    else porClave.set(clave, [movimiento])
  }

  return [...porClave.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, lista]) => ({ clave, etiqueta: etiquetaDeMes(clave), movimientos: lista }))
}

export async function cargarFeedDeMovimientos(
  supabase: SupabaseClient,
  moneda: Moneda
): Promise<FeedDeMovimientos> {
  const { desde, hasta } = rangoDelMesActual()

  const [resMes, resFuturas, resAnteriores] = await Promise.all([
    supabase
      .from('transactions')
      .select('*')
      .gte('date', desde)
      .lte('date', hasta)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    // Todo lo que vence después de este mes, no solo las cuotas: si alguna vez
    // entra un movimiento suelto con fecha futura, tiene que poder verse en
    // algún lado en vez de desaparecer de las tres pestañas.
    supabase
      .from('transactions')
      .select('*')
      .gt('date', hasta)
      .order('date', { ascending: true }),
    supabase
      .from('transactions')
      .select('*')
      .lt('date', desde)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(TOPE_ANTERIORES),
  ])

  const error =
    resMes.error?.message ?? resFuturas.error?.message ?? resAnteriores.error?.message ?? null

  // El modo global de moneda recorta las tres listas por igual.
  const filtrar = (filas: Transaccion[] | null) =>
    (filas ?? []).filter((fila) => esDeLaMoneda(fila, moneda))

  const futuras = filtrar(resFuturas.data as Transaccion[] | null)

  return {
    delMes: filtrar(resMes.data as Transaccion[] | null),
    futuras: agruparPorMes(futuras),
    totalFuturas: futuras.length,
    anteriores: filtrar(resAnteriores.data as Transaccion[] | null),
    error,
  }
}
