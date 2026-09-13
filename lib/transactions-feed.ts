import { movimientosDesde, ultimosMovimientos } from './almacen/consultas'
import type { Libro } from './almacen/libro'
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

/** Un dia antes / despues, sobre `YYYY-MM-DD`. Para los bordes del rango. */
function correrDia(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
const diaSiguiente = (f: string) => correrDia(f, 1)
const diaAnterior = (f: string) => correrDia(f, -1)

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
  libro: Libro,
  moneda: Moneda
): Promise<FeedDeMovimientos> {
  const { desde, hasta } = rangoDelMesActual()

  let delMes: Transaccion[] = []
  let despues: Transaccion[] = []
  let antes: Transaccion[] = []
  let error: string | null = null

  try {
    ;[delMes, despues, antes] = await Promise.all([
      libro.movimientos(desde, hasta),
      // Todo lo que vence después de este mes, no solo las cuotas: si alguna vez
      // entra un movimiento suelto con fecha futura, tiene que poder verse en
      // algún lado en vez de desaparecer de las tres pestañas.
      movimientosDesde(libro, diaSiguiente(hasta)),
      // `ultimosMovimientos` recorre los anios de atras para adelante y corta
      // al llegar al tope, asi que no baja diez anios de historia para mostrar
      // cien filas.
      ultimosMovimientos(libro, TOPE_ANTERIORES, diaAnterior(desde)),
    ])
  } catch (e) {
    error = e instanceof Error ? e.message : 'No se pudieron leer los movimientos.'
  }

  // El modo global de moneda recorta las tres listas por igual.
  const filtrar = (filas: Transaccion[]) =>
    filas.filter((fila) => esDeLaMoneda(fila, moneda))

  // Las futuras se muestran de la mas cercana a la mas lejana; `movimientos()`
  // garantiza lo contrario, asi que acá se da vuelta.
  const futuras = filtrar(despues).reverse()

  return {
    delMes: filtrar(delMes),
    futuras: agruparPorMes(futuras),
    totalFuturas: futuras.length,
    anteriores: filtrar(antes),
    error,
  }
}
