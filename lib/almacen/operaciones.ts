/**
 * OPERACIONES MULTI-BLOQUE — lo que reemplaza a las cascadas de Postgres
 * =============================================================================
 *
 * Borrar una cuenta tiene que borrar también sus movimientos, que viven en N
 * shards. Son N+1 escrituras y no hay forma de hacerlas atómicas. Las dos
 * defensas están explicadas en documentos.ts; acá están aplicadas:
 *
 *   1. HIJOS PRIMERO, PADRE AL FINAL. Un corte deja "una cuenta con menos
 *      movimientos" —feo pero coherente— en vez de movimientos huérfanos
 *      apuntando a una cuenta que ya no existe, que es corrupción de verdad.
 *
 *   2. TODO ES IDEMPOTENTE. Cada `ejecutar*` puede correr dos veces enteras sin
 *      cambiar el resultado, porque el diario la va a rehacer desde el
 *      principio si el proceso se cortó en el medio. Por eso acá se filtra y se
 *      reemplaza-por-id en vez de "sacar uno" o "sumar uno": las operaciones
 *      relativas no sobreviven a un replay.
 *
 * LA PAREJA `xxx()` / `ejecutarXxx()`
 *
 * La pública abre el diario y delega; la `ejecutar*` hace el trabajo y es la
 * que se registra en `REPLAYS`. Están separadas para que reanudar NO vuelva a
 * anotar una intención nueva sobre la que se está reanudando.
 */

import type { Transaccion } from '../types'
import type { Libro, Replays } from './libro'
import type { ShardDeMovimientos } from './documentos'

// --- Utilidades --------------------------------------------------------------

/**
 * Inserta o reemplaza por id. Es la forma idempotente de "guardar": correrla de
 * nuevo deja el shard igual en vez de duplicar la fila.
 */
function ponerMovimiento(
  shard: ShardDeMovimientos,
  movimiento: Transaccion
): ShardDeMovimientos {
  const sinEl = shard.movimientos.filter((m) => m.id !== movimiento.id)
  return { ...shard, movimientos: [...sinEl, movimiento] }
}

function sinLaCuenta(
  aperturas: Record<string, number>,
  cuentaId: string
): Record<string, number> {
  const copia = { ...aperturas }
  delete copia[cuentaId]
  return copia
}

// --- Borrar una cuenta -------------------------------------------------------

export async function borrarCuenta(libro: Libro, cuentaId: string): Promise<void> {
  await libro.diferir('borrar-cuenta', { cuentaId }, () =>
    ejecutarBorrarCuenta(libro, cuentaId)
  )
}

async function ejecutarBorrarCuenta(libro: Libro, cuentaId: string): Promise<void> {
  // 1. Los hijos: sus movimientos, en todos los años.
  for (const anio of await libro.aniosConMovimientos()) {
    await libro.mutarMovimientos(anio, (shard) => ({
      ...shard,
      movimientos: shard.movimientos.filter((m) => m.account_id !== cuentaId),
      // La apertura también se va: si no, el saldo derivado seguiría arrastrando
      // el saldo inicial de una cuenta que ya no existe.
      aperturas: sinLaCuenta(shard.aperturas, cuentaId),
    }))
  }

  // 2. El padre, recién ahora.
  await libro.mutar('cuentas', (cuentas) => cuentas.filter((c) => c.id !== cuentaId))
}

// --- Borrar una categoría ----------------------------------------------------

/**
 * Equivale al `on delete set null` de `transactions.category_id`: el movimiento
 * SOBREVIVE sin categoría. Borrar el gasto junto con la categoría sería perder
 * plata del historial por una decisión de clasificación.
 */
export async function borrarCategoria(libro: Libro, categoriaId: string): Promise<void> {
  await libro.diferir('borrar-categoria', { categoriaId }, () =>
    ejecutarBorrarCategoria(libro, categoriaId)
  )
}

async function ejecutarBorrarCategoria(
  libro: Libro,
  categoriaId: string
): Promise<void> {
  for (const anio of await libro.aniosConMovimientos()) {
    await libro.mutarMovimientos(anio, (shard) => ({
      ...shard,
      movimientos: shard.movimientos.map((m) =>
        m.category_id === categoriaId ? { ...m, category_id: null } : m
      ),
    }))
  }

  // Los presupuestos van embebidos en la categoría, así que se van con ella.
  await libro.mutar('categorias', (cats) => cats.filter((c) => c.id !== categoriaId))
}

// --- Guardar un plan de cuotas ----------------------------------------------

/**
 * Un plan de 12 cuotas cargado en octubre cruza a dos años; uno de 60, a seis.
 * Cada cuota va al shard de SU fecha, así que esto es multi-bloque por
 * naturaleza y necesita el diario.
 *
 * Reemplaza al bloque de `guardarTransaccion` que hoy inserta la primera cuota,
 * después las demás, y si las demás fallan borra la primera para no dejar un
 * plan a medias. Acá esa compensación no hace falta: el replay lo completa.
 */
export async function guardarPlanDeCuotas(
  libro: Libro,
  cuotas: Transaccion[]
): Promise<void> {
  await libro.diferir('guardar-plan-de-cuotas', { cuotas }, () =>
    ejecutarGuardarPlan(libro, cuotas)
  )
}

async function ejecutarGuardarPlan(
  libro: Libro,
  cuotas: Transaccion[]
): Promise<void> {
  // Agrupadas por año para escribir cada shard UNA vez, y no una por cuota.
  const porAnio = new Map<number, Transaccion[]>()
  for (const cuota of cuotas) {
    const anio = Number(cuota.date.slice(0, 4))
    porAnio.set(anio, [...(porAnio.get(anio) ?? []), cuota])
  }

  for (const [anio, delAnio] of [...porAnio].sort((a, b) => a[0] - b[0])) {
    await libro.mutarMovimientos(anio, (shard) =>
      delAnio.reduce(ponerMovimiento, shard)
    )
  }
}

// --- Mover un movimiento de año ---------------------------------------------

/**
 * Cambiar la fecha de un gasto de diciembre a enero lo saca de un shard y lo
 * mete en otro. `anioViejo` viene por parámetro y el movimiento entero también:
 * si el replay corre cuando el movimiento ya se fue del shard viejo, no habría
 * de dónde leerlo.
 */
export async function moverMovimientoDeAnio(
  libro: Libro,
  movimiento: Transaccion,
  anioViejo: number
): Promise<void> {
  await libro.diferir('mover-movimiento-de-anio', { movimiento, anioViejo }, () =>
    ejecutarMover(libro, movimiento, anioViejo)
  )
}

async function ejecutarMover(
  libro: Libro,
  movimiento: Transaccion,
  anioViejo: number
): Promise<void> {
  const anioNuevo = Number(movimiento.date.slice(0, 4))

  // Primero el destino: si se corta acá, el movimiento queda duplicado y
  // visible en los dos años, que se arregla solo al reanudar. Al revés quedaría
  // borrado y no habría nada que lo devolviera.
  await libro.mutarMovimientos(anioNuevo, (shard) => ponerMovimiento(shard, movimiento))

  if (anioViejo !== anioNuevo) {
    await libro.mutarMovimientos(anioViejo, (shard) => ({
      ...shard,
      movimientos: shard.movimientos.filter((m) => m.id !== movimiento.id),
    }))
  }
}

// --- Cierre de ejercicio -----------------------------------------------------

/**
 * Recalcula las aperturas de TODOS los shards, en orden.
 *
 * Es lo que hace que el sharding sea correcto: el saldo de hoy se deriva de la
 * apertura del año más los movimientos del año, sin leer toda la historia. Si
 * las aperturas se desactualizan, los saldos mienten.
 *
 * `mutarMovimientos` ya calcula la apertura cuando nace un shard, así que en
 * condiciones normales esto no hace falta. Existe para dos casos: reparar un
 * almacén que quedó a medias, y la migración inicial, donde los shards nacen
 * todos juntos y fuera de orden.
 *
 * Va en orden ascendente y NO en paralelo a propósito: el cierre de un año
 * depende de la apertura del anterior, así que el orden es la corrección.
 */
export async function recalcularAperturas(libro: Libro): Promise<void> {
  await libro.diferir('cerrar-ejercicio', {}, () => ejecutarRecalculo(libro))
}

async function ejecutarRecalculo(libro: Libro): Promise<void> {
  const anios = [...(await libro.aniosConMovimientos())].sort((a, b) => a - b)

  let aperturas: Record<string, number> = {}

  for (const anio of anios) {
    const propias = aperturas
    await libro.mutarMovimientos(anio, (shard) => ({ ...shard, aperturas: propias }))

    // El cierre de este año es la apertura del siguiente. Se cuentan TODOS los
    // movimientos del año, cuotas futuras incluidas: al 31 de diciembre ya
    // pasaron todas las de ese ejercicio.
    const cierre: Record<string, number> = { ...propias }
    for (const m of await libro.movimientos(`${anio}-01-01`, `${anio}-12-31`)) {
      const delta = m.type === 'INCOME' ? m.amount : -m.amount
      cierre[m.account_id] = (cierre[m.account_id] ?? 0) + delta
    }
    aperturas = cierre
  }
}

// --- El registro que consume `abrirLibro()` ---------------------------------

/**
 * Se inyecta en `abrirLibro(almacen, { replays: REPLAYS })`. Cada entrada
 * recibe los parámetros que se anotaron en el diario, sin tipar: vienen de un
 * JSON que escribió una versión anterior de la app, así que se validan acá y no
 * se confía en el tipo.
 */
export const REPLAYS: Replays = {
  'borrar-cuenta': (libro, p) => ejecutarBorrarCuenta(libro, String(p.cuentaId)),

  'borrar-categoria': (libro, p) =>
    ejecutarBorrarCategoria(libro, String(p.categoriaId)),

  'guardar-plan-de-cuotas': (libro, p) =>
    ejecutarGuardarPlan(libro, (p.cuotas ?? []) as Transaccion[]),

  'mover-movimiento-de-anio': (libro, p) =>
    ejecutarMover(libro, p.movimiento as Transaccion, Number(p.anioViejo)),

  'cerrar-ejercicio': (libro) => ejecutarRecalculo(libro),
}
