/**
 * CAMBIO DE CONTRASEÑA EN MODO CIFRADO
 * =============================================================================
 *
 * Son DOS sistemas sin transacción común: Supabase Auth guarda con qué entrás,
 * y el sobre guarda con qué desciframos. Si se desincronizan, el usuario queda
 * en uno de dos estados rotos:
 *
 *     Auth nueva + sobre viejo  ->  entra y no puede leer sus datos
 *     Auth vieja + sobre nuevo  ->  entra con la vieja y tampoco puede leer
 *
 * EL ORDEN, Y POR QUÉ ESTE
 *
 *     1. rotar el sobre en memoria
 *     2. GUARDAR el sobre nuevo
 *     3. cambiar la contraseña en Auth
 *     4. si 3 falla -> restaurar el sobre viejo
 *
 * Se guarda el sobre primero porque su rollback es el que MÁS chances tiene de
 * salir bien: es un upsert contra la misma tabla a la que acabamos de escribir
 * con éxito hace un segundo. El rollback del otro orden —devolverle a Auth la
 * contraseña vieja— depende de que la sesión siga viva justo después de que
 * Auth la haya rotado, que es exactamente el momento en que puede no estarlo.
 *
 * LA RED QUE NUNCA SE CORTA
 *
 * Aun en el peor caso —falla el paso 3 Y falla el rollback del paso 4— el
 * usuario NO pierde los datos: la envoltura de recuperación no se toca en
 * ninguna rotación de contraseña, así que el código anotado en papel sigue
 * abriendo el sobre. Por eso el mensaje de ese caso dice exactamente eso y no
 * un "error inesperado".
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { rotarContrasena, type SobreDeClaves } from './cripto'
import { guardarSobre, leerSobre } from './nube'

export type ResultadoDeCambio =
  | { ok: true; sobre: SobreDeClaves }
  /** Nada se aplicó. El usuario puede reintentar sin consecuencias. */
  | { ok: false; estado: 'sin-cambios'; error: string }
  /**
   * Auth falló y el sobre volvió a como estaba. Tampoco se aplicó nada, pero
   * hubo una escritura de ida y vuelta: se distingue para poder loguearlo.
   */
  | { ok: false; estado: 'revertido'; error: string }
  /** Lo grave: quedó desincronizado y hay que usar el código de recuperación. */
  | { ok: false; estado: 'desincronizado'; error: string }

const AVISO_DESINCRONIZADO =
  'Tu contraseña de acceso y la de tus datos cifrados quedaron distintas. ' +
  'Entrá con la contraseña anterior y usá tu código de recuperación para ' +
  'volver a sincronizarlas. Tus datos NO se perdieron.'

/**
 * Cambia la contraseña del usuario en los dos sistemas, o en ninguno.
 *
 * `contrasenaVieja` hace falta de verdad y no es ceremonia: es lo único con lo
 * que se puede desenvolver la DEK para volver a envolverla.
 */
export async function cambiarContrasena(
  supabase: SupabaseClient,
  userId: string,
  contrasenaVieja: string,
  contrasenaNueva: string
): Promise<ResultadoDeCambio> {
  // --- 0. El sobre actual ----------------------------------------------------
  let sobreViejo: SobreDeClaves | null
  try {
    sobreViejo = await leerSobre(supabase)
  } catch (error) {
    return { ok: false, estado: 'sin-cambios', error: mensaje(error) }
  }

  if (!sobreViejo) {
    return {
      ok: false,
      estado: 'sin-cambios',
      error: 'No hay un sobre de claves: esta cuenta no está en modo cifrado.',
    }
  }

  // --- 1. Rotar, en memoria --------------------------------------------------
  // Si la contraseña vieja no es la correcta, esto lanza `SecretoIncorrecto` y
  // no se escribió nada en ningún lado.
  let sobreNuevo: SobreDeClaves
  try {
    sobreNuevo = await rotarContrasena(sobreViejo, contrasenaVieja, contrasenaNueva)
  } catch (error) {
    return { ok: false, estado: 'sin-cambios', error: mensaje(error) }
  }

  // --- 2. Guardar el sobre nuevo ---------------------------------------------
  try {
    await guardarSobre(supabase, userId, sobreNuevo)
  } catch (error) {
    return { ok: false, estado: 'sin-cambios', error: mensaje(error) }
  }

  // --- 3. Cambiar la contraseña de acceso ------------------------------------
  const { error: errorAuth } = await supabase.auth.updateUser({
    password: contrasenaNueva,
  })

  if (!errorAuth) {
    return { ok: true, sobre: sobreNuevo }
  }

  // --- 4. Rollback -----------------------------------------------------------
  try {
    await guardarSobre(supabase, userId, sobreViejo)
    return {
      ok: false,
      estado: 'revertido',
      error: `No se pudo cambiar la contraseña: ${errorAuth.message}. No se cambió nada.`,
    }
  } catch {
    // Auth quedó con la vieja y el sobre con la nueva. Es el único camino malo
    // y tiene salida: la envoltura de recuperación nunca se tocó.
    return { ok: false, estado: 'desincronizado', error: AVISO_DESINCRONIZADO }
  }
}

function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido.'
}
