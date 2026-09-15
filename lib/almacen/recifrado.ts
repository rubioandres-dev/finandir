/**
 * PASAR A CIFRADO LO QUE QUEDÓ EN CLARO
 * =============================================================================
 *
 * Un grupo que ya tenía gastos no se puede cifrar desde el servidor: no tiene
 * la llave, y ese es el punto. Lo hace el primer miembro que lo abre con la
 * llave en la mano.
 *
 * También corre después de una expulsión. Ahí no se trata de filas en claro
 * sino de filas cifradas con la generación anterior: el que se fue conserva esa
 * llave, así que mientras esas filas no se reescriban puede seguir leyendo lo
 * que ya conocía. Rotar sin re-cifrar es cerrar la puerta dejando la ventana.
 *
 * POR QUÉ NO ES ATÓMICO, Y POR QUÉ ESTÁ BIEN
 *
 * Son N updates sueltos; PostgREST no expone transacciones. Si se corta a mitad
 * de camino queda una parte cifrada y otra no, y la próxima apertura del grupo
 * sigue por donde iba: cada fila dice sola en qué estado está. Lo importante es
 * que ninguna queda en un estado inválido — una fila se escribe entera o no se
 * escribe.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  cifrarGasto,
  cifrarObjetivo,
  cifrarPago,
  payloadDelGasto,
  payloadDelObjetivo,
  payloadDelPago,
  type EspacioAbierto,
} from './compartidos'
import type { GastoCompartido, Liquidacion, ObjetivoDeGrupo } from '../shared-expenses-service'

/** Las columnas legibles que se vacían al cifrar. */
const GASTO_EN_BLANCO = {
  amount: null,
  description: null,
  category_id: null,
  category_name: null,
  category_icon: null,
  category_color: null,
  split_type: null,
}

const PAGO_EN_BLANCO = { amount: null, note: null }

const OBJETIVO_EN_BLANCO = {
  title: null,
  target_amount: null,
  monthly_contribution: null,
  category_id: null,
  category_name: null,
  category_icon: null,
  category_color: null,
}

/**
 * Cifra las filas que `abrirEspacio` marcó como legibles.
 *
 * Devuelve cuántas se escribieron DE VERDAD. Cero significa que el grupo ya
 * estaba cifrado entero, que es el estado normal después de la primera vez.
 */
export async function recifrarPendientes(
  supabase: SupabaseClient,
  abierto: EspacioAbierto,
  gek: CryptoKey,
  generacion: number
): Promise<number> {
  const { gastos, liquidaciones, objetivos } = abierto.pendientesDeCifrar

  return recifrar(supabase, {
    gek,
    generacion,
    gastos: abierto.gastos.filter((g) => gastos.includes(g.id)),
    liquidaciones: abierto.liquidaciones.filter((l) => liquidaciones.includes(l.id)),
    objetivos: abierto.objetivos.filter((o) => objetivos.includes(o.id)),
  })
}

/**
 * Reescribe TODO el grupo con la llave dada.
 *
 * Es lo que hay que correr después de expulsar a alguien. A diferencia de
 * `recifrarPendientes`, no mira si la fila estaba en claro: la generación vieja
 * también hay que dejarla atrás.
 */
export function recifrarTodo(
  supabase: SupabaseClient,
  abierto: EspacioAbierto,
  gek: CryptoKey,
  generacion: number
): Promise<number> {
  return recifrar(supabase, {
    gek,
    generacion,
    gastos: abierto.gastos,
    liquidaciones: abierto.liquidaciones,
    objetivos: abierto.objetivos,
  })
}

/**
 * Escribe una fila y devuelve 1 si de verdad se escribió.
 *
 * El `.select('id')` no es adorno: un UPDATE que la RLS descarta devuelve éxito
 * habiendo tocado cero filas. Contar intentos en vez de escrituras haría que
 * una rotación a medias se reporte como completa, que es exactamente el error
 * que nadie ve hasta que alguien lee lo que no debería.
 */
async function escribir(
  supabase: SupabaseClient,
  tabla: string,
  id: string,
  cambios: Record<string, unknown>
): Promise<number> {
  const { data, error } = await supabase.from(tabla).update(cambios).eq('id', id).select('id')
  if (error) return 0
  return (data ?? []).length > 0 ? 1 : 0
}

async function recifrar(
  supabase: SupabaseClient,
  entrada: {
    gek: CryptoKey
    generacion: number
    gastos: GastoCompartido[]
    liquidaciones: Liquidacion[]
    objetivos: ObjetivoDeGrupo[]
  }
): Promise<number> {
  const { gek, generacion } = entrada
  let escritas = 0

  for (const gasto of entrada.gastos) {
    escritas += await escribir(supabase, 'shared_transactions', gasto.id, {
      ...GASTO_EN_BLANCO,
      payload_cifrado: await cifrarGasto(gek, payloadDelGasto(gasto)),
      generacion,
    })
  }

  for (const pago of entrada.liquidaciones) {
    escritas += await escribir(supabase, 'shared_settlements', pago.id, {
      ...PAGO_EN_BLANCO,
      payload_cifrado: await cifrarPago(gek, payloadDelPago(pago)),
      generacion,
    })
  }

  for (const objetivo of entrada.objetivos) {
    escritas += await escribir(supabase, 'shared_goals', objetivo.id, {
      ...OBJETIVO_EN_BLANCO,
      payload_cifrado: await cifrarObjetivo(gek, payloadDelObjetivo(objetivo)),
      generacion,
    })
  }

  // Los repartos viejos viven en `shared_splits`, en claro. Una vez que el
  // gasto se guardó cifrado —con su reparto adentro— esas filas son una copia
  // legible de algo que ya no debería serlo.
  if (entrada.gastos.length > 0) {
    await supabase
      .from('shared_splits')
      .delete()
      .in('transaction_id', entrada.gastos.map((g) => g.id))
  }

  return escritas
}
