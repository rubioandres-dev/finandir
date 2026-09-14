/**
 * SACAR A ALGUIEN DE UN GRUPO
 * =============================================================================
 *
 * Borrar la fila del miembro no alcanza y nunca alcanzó. El que se va se llevó
 * la llave del grupo en su navegador; mientras los gastos sigan cifrados con
 * esa llave, los puede seguir leyendo aunque la base ya no lo liste como
 * miembro. La RLS le corta el acceso a las filas nuevas y nada más.
 *
 * Por eso expulsar son tres cosas, en este orden:
 *
 *   1. llave nueva para los que quedan
 *   2. re-cifrar TODO el grupo con esa llave
 *   3. recién ahí, borrar al miembro
 *
 * El orden no es preferencia. Al revés, un corte en el medio deja al grupo sin
 * nadie con llave vigente, o con la mitad de los gastos todavía legibles por el
 * que acaba de irse.
 *
 * LO QUE ESTO NO PUEDE DESHACER
 *
 * Lo que el otro ya vio, lo vio. Ninguna rotación borra una captura de pantalla
 * ni una memoria. Lo que se garantiza es lo único garantizable: desde este
 * momento no lee nada más, ni lo nuevo ni lo viejo.
 *
 * CORRE EN EL NAVEGADOR
 *
 * Necesita la llave del grupo abierta, así que no hay versión de esto en el
 * servidor. Una acción de servidor que borrara el miembro sin rotar sería peor
 * que no tener el botón: diría que expulsó a alguien que sigue leyendo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { abrirEspacio } from './compartidos'
import { expulsarYRotar } from './espacios'
import { recifrarTodo } from './recifrado'
import { cargarEspacioCrudo } from '../shared-expenses-service'
import { ErrorDelAlmacen } from './tipos'

export type ResultadoDeExpulsion = {
  generacion: number
  /** Cuántas filas quedaron escritas con la llave nueva. */
  recifradas: number
}

export async function expulsarDelGrupo(
  supabase: SupabaseClient,
  opciones: {
    spaceId: string
    memberIdExpulsado: string
    generacionActual: number
    /** Todas las llaves que YO puedo abrir: hacen falta para leer lo viejo. */
    llaves: Map<number, CryptoKey>
    /** Los que se quedan, con su pública. Sin ella no se les puede dar la nueva. */
    quedan: { memberId: string; publica: JsonWebKey }[]
  }
): Promise<ResultadoDeExpulsion> {
  const { spaceId, memberIdExpulsado, generacionActual, llaves, quedan } = opciones

  if (quedan.length === 0) {
    throw new ErrorDelAlmacen(
      'No se puede rotar la llave sin nadie a quien dársela.',
      'SIN_QUIEN_QUEDE'
    )
  }

  // Leer ANTES de rotar: después de la rotación la llave vieja ya no se
  // reparte, y sin haber abierto los gastos no habría con qué re-cifrarlos.
  const { crudo, error } = await cargarEspacioCrudo(supabase, spaceId)
  if (error) throw new ErrorDelAlmacen(error)

  const abierto = await abrirEspacio(crudo, llaves)

  const rotacion = await expulsarYRotar(
    supabase,
    spaceId,
    generacionActual,
    quedan.map((m) => ({ memberId: m.memberId, publica: m.publica })),
    memberIdExpulsado
  )

  const recifradas = await recifrarTodo(supabase, abierto, rotacion.gek, rotacion.generacion)

  return { generacion: rotacion.generacion, recifradas }
}
