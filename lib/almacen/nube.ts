/**
 * ALMACÉN NUBE — bloques cifrados sobre Supabase
 * =============================================================================
 *
 * Implementa `Almacen` contra las tablas de `migrations/018_almacen_cifrado.sql`.
 * No sabe nada de cifrado: recibe bytes opacos y los guarda. Quien lo compone
 * con `crearAlmacenCifrado()` es el que decide que esos bytes vengan cifrados,
 * y en el modo C3 SIEMPRE vienen así.
 *
 *     crearLibro(crearAlmacenCifrado(crearAlmacenNube(supabase), claves))
 *
 * NUNCA LO USES SIN EL ENVOLTORIO. Sin él, este backend guarda JSON en claro en
 * una tabla del servidor, que es exactamente lo que el modo quiere evitar. La
 * separación existe para poder testear el transporte sin claves, no para
 * ofrecer una variante sin cifrar.
 *
 * POR QUÉ LA ESCRITURA VA POR RPC Y NO POR `.update()`
 *
 * `almacen_guardar` hace la comparación de versión y el incremento en la misma
 * sentencia, así que dos escrituras simultáneas no pueden leer el mismo número.
 * Con un `.update().eq('version', n)` desde el cliente el resultado sería
 * parecido, pero crear-si-no-existe necesitaría un segundo viaje.
 *
 * El RPC devuelve la versión nueva, o `null` cuando hubo conflicto. `null` no es
 * un error de la base: es la respuesta esperada cuando otro dispositivo se
 * adelantó, y acá se traduce a `ConflictoDeVersion`.
 */

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { aBase64, desdeBase64 } from './base64'
import type { SobreDeClaves } from './cripto'
import {
  AlmacenNoAutorizado,
  AlmacenSinEspacio,
  ConflictoDeVersion,
  type Almacen,
  type Clave,
  type ResumenDeBloque,
  type Version,
  type VersionEsperada,
} from './tipos'

export const TABLA_BLOQUES = 'almacen_bloques'
export const TABLA_SOBRES = 'almacen_sobres'

/** Falta correr migrations/018. */
export const FALTA_MIGRACION_ALMACEN =
  'Falta el esquema del almacén cifrado. Ejecutá migrations/018_almacen_cifrado.sql ' +
  'en el SQL Editor de Supabase.'

/** Mismos códigos que usa el resto de la app para "no existe la tabla". */
export function faltaLaTabla(codigo?: string): boolean {
  return codigo === 'PGRST205' || codigo === 'PGRST204' || codigo === '42P01'
}

/**
 * Traduce el error de PostgREST al vocabulario de `Almacen`.
 *
 * Los códigos de autorización están verificados; el de falta de espacio NO
 * —`53100` es "disk full" de Postgres y Supabase puede responder distinto
 * cuando el proyecto se pasa de cuota—. Por eso también se mira el mensaje, y
 * si no cae en ninguno se relanza el error original en vez de inventar una
 * causa: un error mal clasificado manda a la UI a decirle al usuario que haga
 * algo que no va a servir.
 */
function traducir(error: PostgrestError): never {
  if (faltaLaTabla(error.code)) {
    throw new Error(FALTA_MIGRACION_ALMACEN)
  }

  // PGRST301 = JWT vencido. 42501 = la RLS rechazó la operación.
  if (error.code === 'PGRST301' || error.code === '42501') {
    throw new AlmacenNoAutorizado('nube')
  }

  if (error.code === '53100' || /quota|disk|space/i.test(error.message)) {
    throw new AlmacenSinEspacio('nube')
  }

  throw error
}

type FilaDeBloque = {
  contenido: string
  version: number
}

export function crearAlmacenNube(supabase: SupabaseClient): Almacen {
  return {
    tipo: 'nube',

    async obtener(clave: Clave) {
      // Sin filtro por user_id: la RLS ya limita a las filas propias y la clave
      // primaria es (user_id, clave), así que esto devuelve una fila o ninguna.
      const { data, error } = await supabase
        .from(TABLA_BLOQUES)
        .select('contenido, version')
        .eq('clave', clave)
        .maybeSingle<FilaDeBloque>()

      if (error) traducir(error)
      if (!data) return null

      return {
        clave,
        contenido: desdeBase64(data.contenido),
        version: String(data.version),
      }
    },

    async guardar(
      clave: Clave,
      contenido: Uint8Array<ArrayBuffer>,
      versionEsperada: VersionEsperada
    ) {
      const { data, error } = await supabase.rpc('almacen_guardar', {
        p_clave: clave,
        p_contenido: aBase64(contenido),
        // `null` significa "creá esto". El RPC distingue los dos casos.
        p_version_esperada: versionEsperada === null ? null : Number(versionEsperada),
      })

      if (error) traducir(error)

      // El RPC no puede devolver el bloque actual junto con el rechazo sin
      // gastar un select extra en el camino feliz. El lazo de reintentos
      // releela solo: `actual: null` es correcto, no es información perdida.
      if (data === null || data === undefined) {
        throw new ConflictoDeVersion(clave, null)
      }

      return { clave, contenido, version: String(data) }
    },

    async borrar(clave: Clave, versionEsperada: Version) {
      const { data, error } = await supabase
        .from(TABLA_BLOQUES)
        .delete()
        .eq('clave', clave)
        .eq('version', Number(versionEsperada))
        .select('clave')

      if (error) traducir(error)
      // Cero filas borradas = la versión no coincidía. Mismo criterio que el
      // update: no se borra a ciegas.
      if (!data || data.length === 0) {
        throw new ConflictoDeVersion(clave, null)
      }
    },

    async listar() {
      // `bytes` es una columna calculada (octet_length) justamente para poder
      // pedir esto sin bajar el ciphertext.
      const { data, error } = await supabase
        .from(TABLA_BLOQUES)
        .select('clave, version, bytes, actualizado')
        .order('clave')

      if (error) traducir(error)

      return (data ?? []).map(
        (fila): ResumenDeBloque => ({
          clave: fila.clave as string,
          version: String(fila.version),
          bytes: Number(fila.bytes ?? 0),
          modificado: (fila.actualizado as string) ?? null,
        })
      )
    },
  }
}

// --- El sobre de claves ------------------------------------------------------

/**
 * El sobre vive en su propia tabla y NO pasa por `Almacen`: hay que poder
 * leerlo antes de tener las claves, que es justamente lo que `Almacen` ya
 * necesita para funcionar en modo cifrado. Meterlo adentro sería un ciclo.
 */
export async function leerSobre(
  supabase: SupabaseClient
): Promise<SobreDeClaves | null> {
  const { data, error } = await supabase
    .from(TABLA_SOBRES)
    .select('sobre')
    .maybeSingle<{ sobre: SobreDeClaves }>()

  if (error) traducir(error)
  return data?.sobre ?? null
}

/**
 * Guarda el sobre del usuario logueado. Sirve para el alta y para las dos
 * rotaciones (contraseña y código de recuperación).
 *
 * `user_id` va explícito porque el insert lo necesita; la RLS igual verifica
 * que coincida con `auth.uid()`, así que mandar otro no sirve de nada.
 */
export async function guardarSobre(
  supabase: SupabaseClient,
  userId: string,
  sobre: SobreDeClaves
): Promise<void> {
  const { error } = await supabase
    .from(TABLA_SOBRES)
    .upsert(
      { user_id: userId, sobre, actualizado: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  if (error) traducir(error)
}
