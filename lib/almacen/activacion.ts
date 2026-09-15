/**
 * ACTIVAR Y DESACTIVAR BÓVEDA
 * =============================================================================
 *
 * Cambiar de modo es mover TODOS los datos de un usuario de un lado al otro. Es
 * la operación más peligrosa de la app, y la única cuyo fracaso no se puede
 * arreglar volviendo a intentar si se hace en el orden equivocado.
 *
 * EL ORDEN, Y POR QUÉ ESTE
 *
 *     1. crear el sobre de claves y guardarlo
 *     2. escribir TODOS los bloques cifrados
 *     3. verificar que lo escrito reproduce lo que había
 *     4. recién ahí, mover el puntero `storage_backend`
 *
 * El puntero va ÚLTIMO y eso es lo que hace segura a la operación. Hasta que se
 * mueve, el usuario sigue leyendo de las tablas de siempre: si el paso 2 o el 3
 * fallan, o si cierra el navegador en el medio, no perdió nada — lo único que
 * queda es un juego de bloques a medio escribir que nadie mira y que la próxima
 * corrida pisa entera.
 *
 * Al revés —mover el puntero primero y migrar después— cualquier corte dejaría
 * al usuario apuntando a un almacén incompleto, viendo parte de sus finanzas y
 * sin forma de saber que falta algo.
 *
 * NO SE BORRA NADA
 *
 * Las tablas viejas quedan intactas, a propósito. Volver atrás tiene que ser
 * posible mientras el modo sea nuevo, y el borrado es una decisión aparte que se
 * toma cuando ya nadie dude. Eso SÍ significa que, hasta que se corra esa
 * limpieza, los datos siguen legibles en Supabase: la promesa de cifrado no es
 * real el día que alguien activa el modo, es real el día que se dropean las
 * tablas.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { backendDelUsuario, fijarBackend, libroDelNavegador } from './acceso'
import { todosLosMovimientos } from './consultas'
import { COLECCIONES, type NombreDeColeccion } from './documentos'
import { crearSobre, type Claves } from './cripto'
import { migrarDesdeSupabase, type Discrepancia } from './migracion'
import { guardarSobre, TABLA_BLOQUES } from './nube'
import { crearLibroRelacional } from './relacional'

export type ResultadoDeActivacion =
  | {
      ok: true
      /**
       * Se muestra UNA vez y no se guarda en ningún lado. Es la única forma de
       * recuperar los datos si el usuario olvida su contraseña.
       */
      codigoDeRecuperacion: string
      claves: Claves
      resumen: { movimientos: number; cuentas: number; categorias: number }
    }
  | {
      ok: false
      error: string
      /**
       * Qué no cerró en la verificación. Vacío si falló antes de llegar ahí.
       * El usuario NO cambió de modo en ningún caso.
       */
      discrepancias: Discrepancia[]
    }

/**
 * Pasa una cuenta de Estándar a Bóveda.
 *
 * Corre en el NAVEGADOR: la contraseña no puede pasar por el servidor, que es
 * de quien el modo protege los datos.
 */
export async function activarBoveda(
  supabase: SupabaseClient,
  userId: string,
  contrasena: string
): Promise<ResultadoDeActivacion> {
  // --- 0. Empezar de cero ----------------------------------------------------
  //
  // POR QUÉ HAY QUE BORRAR BLOQUES ANTES DE ESCRIBIRLOS
  //
  // Un intento anterior que falló —o una vuelta a Estándar— deja bloques
  // cifrados con una DEK que ya no existe. Acá abajo se crea un sobre NUEVO, y
  // escribir una colección es leerla primero: leer un bloque viejo con la clave
  // nueva no descifra, y el error que sale es "la contraseña no es correcta",
  // que manda al usuario a dudar de lo único que estaba bien.
  //
  // El comentario de arriba decía que la próxima corrida "pisa entera" la
  // anterior. Era la intención y no era verdad: se pisa después de leer.
  //
  // No se pierde nada. En modo Estándar la verdad está en las tablas, y esto
  // copia desde ahí; un bloque que quedó de un intento fallido no es un dato,
  // es basura que nadie puede abrir.
  try {
    const backend = await backendDelUsuario(supabase, userId)
    if (backend !== 'SUPABASE') {
      return {
        ok: false,
        discrepancias: [],
        error: 'Esta cuenta ya está en modo cifrado.',
      }
    }

    const { error } = await supabase.from(TABLA_BLOQUES).delete().eq('user_id', userId)
    if (error) throw new Error(error.message)
  } catch (error) {
    return {
      ok: false,
      discrepancias: [],
      error: mensajeDe(error, 'No se pudo preparar el almacén cifrado.'),
    }
  }

  // --- 1. Las claves ---------------------------------------------------------
  let sobreNuevo
  try {
    sobreNuevo = await crearSobre(contrasena)
    await guardarSobre(supabase, userId, sobreNuevo.sobre)
  } catch (error) {
    return {
      ok: false,
      discrepancias: [],
      error: mensajeDe(error, 'No se pudieron crear las claves.'),
    }
  }

  // --- 2. Los datos ----------------------------------------------------------
  let resumen
  try {
    const libro = await libroDelNavegador(supabase, sobreNuevo.claves)
    resumen = await migrarDesdeSupabase(supabase, libro)
  } catch (error) {
    return {
      ok: false,
      discrepancias: [],
      error: mensajeDe(error, 'No se pudieron copiar los datos.'),
    }
  }

  // --- 3. La verificación ----------------------------------------------------
  if (resumen.discrepancias.length > 0) {
    return {
      ok: false,
      discrepancias: resumen.discrepancias,
      error:
        'La copia no coincide con los datos originales, así que no se cambió el modo. ' +
        'Tus datos siguen como estaban.',
    }
  }

  // --- 4. El puntero, último -------------------------------------------------
  try {
    await fijarBackend(supabase, userId, 'NUBE')
  } catch (error) {
    return {
      ok: false,
      discrepancias: [],
      error: mensajeDe(error, 'Los datos se copiaron pero no se pudo activar el modo.'),
    }
  }

  return {
    ok: true,
    codigoDeRecuperacion: sobreNuevo.codigoDeRecuperacion,
    claves: sobreNuevo.claves,
    resumen: {
      movimientos: resumen.movimientos,
      cuentas: resumen.cuentas,
      categorias: resumen.categorias,
    },
  }
}

export type ResultadoDeVuelta =
  | { ok: true; resumen: { movimientos: number } }
  | { ok: false; error: string }

/**
 * Vuelve de Bóveda a Estándar.
 *
 * Existe porque un modo del que no se puede salir no es una opción, es una
 * trampa. El usuario tiene que poder arrepentirse mientras el modo sea nuevo
 * para él.
 *
 * Mismo orden que la ida, por la misma razón: los datos primero y el puntero al
 * final. Y también acá el origen queda intacto — los bloques cifrados no se
 * borran, así que un corte deja al usuario exactamente donde estaba.
 *
 * OJO CON LO QUE SIGNIFICA: volver a Estándar vuelve a poner las finanzas del
 * usuario en tablas que el servidor puede leer. Quien llame tiene que decírselo
 * antes, no después.
 */
export async function volverAEstandar(
  supabase: SupabaseClient,
  userId: string,
  claves: Claves
): Promise<ResultadoDeVuelta> {
  try {
    const cifrado = await libroDelNavegador(supabase, claves)
    const relacional = crearLibroRelacional(supabase, userId)

    // Las colecciones chicas van enteras: el adaptador relacional diferencia
    // contra lo que hay, asi que reescribir lo mismo no toca ninguna fila.
    for (const coleccion of COLECCIONES) {
      if (coleccion === 'perfil') continue
      const datos = await cifrado.leer(coleccion)
      await relacional.mutar(coleccion, () => datos)
    }

    // Los movimientos van por el metodo angosto: `mutarMovimientos` no existe
    // del lado relacional, y con razon —diferenciar miles de filas por escritura
    // es inviable—. `agregarMovimientos` hace upsert por id, asi que reintentar
    // es inofensivo.
    const movimientos = await todosLosMovimientos(cifrado)
    await relacional.agregarMovimientos(movimientos)

    await fijarBackend(supabase, userId, 'SUPABASE')

    return { ok: true, resumen: { movimientos: movimientos.length } }
  } catch (error) {
    return {
      ok: false,
      error: mensajeDe(error, 'No se pudieron devolver los datos. No se cambió el modo.'),
    }
  }
}

/** Las colecciones que se copian, sin el perfil. Ver el bucle de arriba. */
export const COLECCIONES_A_COPIAR: NombreDeColeccion[] = COLECCIONES.filter(
  (c) => c !== 'perfil'
)

function mensajeDe(error: unknown, porDefecto: string): string {
  return error instanceof Error ? `${porDefecto} (${error.message})` : porDefecto
}
