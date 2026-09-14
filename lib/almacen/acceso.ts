/**
 * ACCESO — de dónde sale el `Libro` de cada usuario
 * =============================================================================
 *
 * Todo lo demás ya habla `Libro`. Esto decide CUÁL, y es el punto donde el modo
 * de guardado deja de ser una fila en una tabla y pasa a ser algo que la app
 * hace.
 *
 * HAY DOS FUNCIONES Y NO UNA, Y ESO ES EL DISEÑO
 *
 * No existe un `libroDelUsuario()` universal, porque el servidor y el navegador
 * NO pueden leer lo mismo:
 *
 *     modo Estándar  ->  servidor y navegador, los dos
 *     modo Bóveda    ->  SOLO el navegador
 *
 * En Bóveda la clave vive en el dispositivo y nunca viaja. El servidor puede
 * bajar los bloques cifrados y no tiene con qué abrirlos — no es una limitación
 * que se pueda levantar con más código, es el punto entero del modo.
 *
 * Por eso `libroDelServidor()` LANZA cuando el usuario está en Bóveda, en vez de
 * devolver un libro vacío. Un libro vacío haría que el dashboard se renderice en
 * cero y el usuario vea sus finanzas como si no tuviera nada: el peor error
 * posible, porque parece un dato en vez de una falla.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { crearAlmacenCifrado, type Claves } from './cripto'
import { abrirLibro, type Libro, type Migraciones } from './libro'
import { crearAlmacenNube } from './nube'
import { REPLAYS } from './operaciones'
import { crearLibroRelacional } from './relacional'

/** Espeja el enum `storage_backend` de migrations/018. */
export type Backend = 'SUPABASE' | 'NUBE' | 'DRIVE'

/**
 * De una versión de esquema de documentos a la siguiente.
 *
 * Vacío porque `ESQUEMA_ACTUAL` es 1 y no hubo ninguna todavía. Existe igual
 * para que `abrirLibro()` reciba siempre el mismo registro y el día que haya una
 * migración no haya que acordarse de cablearla en cada punto de entrada.
 */
export const MIGRACIONES: Migraciones = {}

/**
 * El servidor no puede leer los datos de este usuario.
 *
 * Quien la atrape tiene que renderizar la cáscara de la página y dejar que el
 * navegador cargue los datos. NO es un error para mostrarle al usuario.
 */
export class ModoCifradoEnServidor extends Error {
  constructor(readonly backend: Backend) {
    super(
      `La cuenta guarda en modo ${backend}: los datos se descifran en el ` +
        'navegador y el servidor no puede leerlos.'
    )
    this.name = 'ModoCifradoEnServidor'
  }
}

/**
 * Dónde guarda este usuario.
 *
 * Vive en Supabase y no en el almacén, siempre: hay que saber DÓNDE están los
 * datos antes de poder ir a buscarlos, así que ese dato no puede estar adentro
 * de los datos.
 *
 * Sin la 018 la columna no existe y todos son `SUPABASE`, que es exactamente lo
 * que eran antes de que el modo existiera.
 */
export async function backendDelUsuario(
  supabase: SupabaseClient,
  userId: string
): Promise<Backend> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('storage_backend')
    .eq('user_id', userId)
    .maybeSingle<{ storage_backend: Backend | null }>()

  if (error || !data?.storage_backend) return 'SUPABASE'
  return data.storage_backend
}

/**
 * El libro para un Server Component o una Server Action.
 *
 * Lanza `ModoCifradoEnServidor` si la cuenta no está en modo Estándar. No corre
 * `abrirLibro()` y no hace falta: el libro relacional no tiene manifiesto, ni
 * diario que reanudar, ni esquema de documentos que migrar — las cascadas las
 * sigue haciendo Postgres con sus claves foráneas.
 */
export async function libroDelServidor(
  supabase: SupabaseClient,
  userId?: string
): Promise<Libro> {
  const backend = await backendDeEsteRequest(supabase, userId)

  if (backend !== 'SUPABASE') throw new ModoCifradoEnServidor(backend)

  return crearLibroRelacional(supabase, userId)
}

/**
 * El backend del usuario, UNA vez por request.
 *
 * `libroDelServidor()` se llama varias veces por pagina —una por service— y sin
 * el memo cada una pagaria su propia consulta a `user_profiles` para preguntar
 * lo mismo. Misma clave que el memo del libro: el cliente de Supabase, que es
 * nuevo en cada request.
 */
const backendPorCliente = new WeakMap<SupabaseClient, Promise<Backend>>()

function backendDeEsteRequest(
  supabase: SupabaseClient,
  userId?: string
): Promise<Backend> {
  const enCurso = backendPorCliente.get(supabase)
  if (enCurso) return enCurso

  const pedido = (async () => {
    const id = userId ?? (await supabase.auth.getUser()).data.user?.id
    // Sin sesion no hay a quien preguntarle: que decida el middleware, no esto.
    if (!id) return 'SUPABASE' as const
    return backendDelUsuario(supabase, id)
  })()

  backendPorCliente.set(supabase, pedido)
  return pedido
}

/**
 * El libro para el navegador, en modo Bóveda.
 *
 * ACÁ SÍ se pasa por `abrirLibro()`, y es donde importa: corre las migraciones
 * de esquema y REANUDA lo que haya quedado a medias antes de dejar leer. Sin
 * eso, un borrado que se corto a la mitad se vería como un estado valido — con
 * un plan de cuotas incompleto, por ejemplo — y nadie lo completaría nunca.
 *
 * `claves` sale de la sesión cifrada (`sesion.ts`) o de abrir el sobre con la
 * contraseña. Si no hay, no hay libro: es el contrato del modo.
 */
export async function libroDelNavegador(
  supabase: SupabaseClient,
  claves: Claves
): Promise<Libro> {
  return abrirLibro(crearAlmacenCifrado(crearAlmacenNube(supabase), claves), {
    replays: REPLAYS,
    migraciones: MIGRACIONES,
  })
}

/**
 * Deja escrito dónde guarda el usuario.
 *
 * Se llama al final de un cambio de modo, DESPUÉS de que la migración de datos
 * cerró y se verificó. Antes seria mentir: el puntero diria que los datos estan
 * en un lado donde todavia no estan completos.
 */
export async function fijarBackend(
  supabase: SupabaseClient,
  userId: string,
  backend: Backend
): Promise<void> {
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ user_id: userId, storage_backend: backend }, { onConflict: 'user_id' })

  if (error) throw new Error(error.message)
}
