/**
 * CONSULTAS — lo que varias services necesitan y `Libro` no da de una
 * =============================================================================
 *
 * `Libro.movimientos()` pide un rango, porque en modo documentos el rango es lo
 * que decide cuantos shards hay que bajar. Pero hay dos preguntas que las
 * pantallas hacen sin rango:
 *
 *     "los ultimos 100 movimientos"      (el dashboard, el feed)
 *     "todos los planes de cuotas"       (compromisos)
 *
 * Resolverlas con un rango absurdo —1970 a 2999— funciona y baja TODA la
 * historia del usuario para mostrar cien filas. Estas dos funciones recorren
 * los anios de atras para adelante y paran cuando ya tienen lo que hace falta,
 * asi que en el caso normal tocan un shard o dos.
 *
 * Viven aca y no en `Libro` a proposito: son composiciones sobre la interface,
 * no capacidades del almacen. Un backend nuevo no tiene que implementarlas.
 */

import type { Transaccion } from '../types'
import type { Libro } from './libro'

/**
 * Los ultimos `cuantos` movimientos hasta `hasta` inclusive, de mas nuevo a mas
 * viejo.
 *
 * Recorre los anios en orden descendente y corta apenas junta el tope. Un
 * usuario con diez anios de historia que mira el dashboard lee un shard, no
 * diez.
 */
export async function ultimosMovimientos(
  libro: Libro,
  cuantos: number,
  hasta = '2999-12-31'
): Promise<Transaccion[]> {
  const anios = (await libro.aniosConMovimientos())
    .filter((anio) => anio <= Number(hasta.slice(0, 4)))
    .sort((a, b) => b - a)

  const juntados: Transaccion[] = []

  for (const anio of anios) {
    const delAnio = await libro.movimientos(
      `${anio}-01-01`,
      hasta < `${anio}-12-31` ? hasta : `${anio}-12-31`
    )
    juntados.push(...delAnio)
    if (juntados.length >= cuantos) break
  }

  // Ya vienen ordenados por anio y `movimientos()` garantiza el orden adentro
  // de cada uno, asi que concatenar de mas nuevo a mas viejo alcanza.
  return juntados.slice(0, cuantos)
}

/**
 * Todo lo que hay, sin rango.
 *
 * Es honestamente cara —lee todos los shards— y solo la deberia usar quien de
 * verdad necesite la historia completa. Hoy: los planes de cuotas, que pueden
 * haber empezado hace anios y siguen vigentes.
 */
export async function todosLosMovimientos(libro: Libro): Promise<Transaccion[]> {
  const anios = await libro.aniosConMovimientos()
  if (anios.length === 0) return []

  return libro.movimientos(
    `${Math.min(...anios)}-01-01`,
    `${Math.max(...anios)}-12-31`
  )
}

/** Desde una fecha hasta el final de lo que haya. Para "lo que viene". */
export async function movimientosDesde(
  libro: Libro,
  desde: string
): Promise<Transaccion[]> {
  const anios = await libro.aniosConMovimientos()
  const ultimo = anios.length ? Math.max(...anios) : Number(desde.slice(0, 4))
  const fin = `${Math.max(ultimo, Number(desde.slice(0, 4)))}-12-31`
  return libro.movimientos(desde, fin)
}
