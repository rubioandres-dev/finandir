/**
 * ENTRAR A UN GRUPO CIFRADO
 * =============================================================================
 *
 * Junta las tres piezas que ya existían y que hasta ahora nadie llamaba: el par
 * de claves del usuario (`grupos.ts`), los sobres del espacio (`espacios.ts`) y
 * el sobre personal donde vive la privada (`nube.ts`).
 *
 * SÓLO CORRE EN EL NAVEGADOR
 *
 * Necesita la DEK del usuario, que sale de su contraseña y nunca llega al
 * servidor. No es una decisión de dónde poner el código: es el motivo entero
 * por el que el servidor no puede leer un gasto compartido.
 *
 * QUIÉN ESTRENA LA LLAVE DE UN GRUPO QUE NO LA TIENE
 *
 * El CREADOR, y sólo él. Los grupos que ya existían no tienen ninguna llave, y
 * alguien tiene que hacer la primera. Si pudiera cualquier admin, dos que
 * abrieran el grupo a la vez generarían dos llaves distintas para la misma
 * generación: el grupo se partiría en dos mitades que no se leen entre sí, sin
 * ningún error a la vista. Un solo responsable evita esa carrera sin necesidad
 * de un lock.
 *
 * MIENTRAS TANTO EL GRUPO SE VE IGUAL
 *
 * Un miembro sin llave todavía lee las filas viejas, que están en claro. No ve
 * las nuevas. Es un estado de transición honesto: mejor que vaciarle la
 * pantalla hasta que un admin se acuerde de darle acceso.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Claves } from './cripto'
import { asegurarParDeClaves } from './grupos'
import { guardarSobre, leerSobre } from './nube'
import {
  clavesDelEspacio,
  darAccesoAlMiembro,
  estrenarClaveDeEspacio,
  publicarClavePublica,
} from './espacios'
import { ErrorDelAlmacen } from './tipos'

export type AccesoAlGrupo = {
  /** Todas las generaciones que este miembro puede abrir. Vacío = sin acceso. */
  llaves: Map<number, CryptoKey>
  /** La llave con la que se escribe de ahora en más. `null` = sólo lectura. */
  gek: CryptoKey | null
  generacion: number
  /**
   * Está en el grupo y nadie le envolvió la llave todavía. Puede ver lo viejo
   * en claro y nada de lo cifrado; un admin tiene que darle acceso.
   */
  sinLlave: boolean
  /** Su privada, para cuando haya que abrir otro espacio en la misma sesión. */
  privada: CryptoKey
}

export async function entrarAlGrupo(
  supabase: SupabaseClient,
  opciones: {
    userId: string
    spaceId: string
    miMiembroId: string
    soyElCreador: boolean
    /** `shared_spaces.generacion`: la vigente del grupo. */
    generacion: number
    claves: Claves
  }
): Promise<AccesoAlGrupo> {
  const { userId, spaceId, miMiembroId, soyElCreador, generacion } = opciones

  // --- 1. El par de claves del usuario ---------------------------------------
  const sobreGuardado = await leerSobre(supabase)
  if (!sobreGuardado) {
    throw new ErrorDelAlmacen('No encontramos tu sobre de claves.', 'SIN_SOBRE')
  }

  const { sobre, claves, creado } = await asegurarParDeClaves(sobreGuardado, opciones.claves)
  // Si el par se acaba de crear hay que guardarlo ANTES de repartir nada: una
  // llave envuelta con una pública cuya privada no quedó guardada es una llave
  // que ya nadie puede abrir.
  if (creado) await guardarSobre(supabase, userId, sobre)

  const privada = claves.privada
  if (!privada) {
    throw new ErrorDelAlmacen('No se pudo abrir tu clave privada.', 'SIN_PRIVADA')
  }

  // --- 2. Publicar la pública, si hace falta ---------------------------------
  // Se compara antes de escribir: sin eso, cada apertura del grupo haría un
  // UPDATE que no cambia nada y que la RLS igual tiene que evaluar.
  const { data: miFila } = await supabase
    .from('shared_space_members')
    .select('clave_publica')
    .eq('id', miMiembroId)
    .maybeSingle<{ clave_publica: JsonWebKey | null }>()

  if (!miFila?.clave_publica && sobre.par) {
    await publicarClavePublica(supabase, miMiembroId, sobre.par.publica)
  }

  // --- 3. Las llaves del espacio ---------------------------------------------
  let llaves = await clavesDelEspacio(supabase, spaceId, miMiembroId, privada)

  if (llaves.size === 0 && soyElCreador && sobre.par) {
    const estrenada = await estrenarSiElGrupoNoTieneNinguna(
      supabase,
      spaceId,
      miMiembroId,
      sobre.par.publica,
      generacion
    )
    if (estrenada) llaves = new Map([[generacion, estrenada]])
  }

  return {
    llaves,
    gek: llaves.get(generacion) ?? null,
    generacion,
    sinLlave: llaves.size === 0,
    privada,
  }
}

/**
 * Estrena la llave del grupo, salvo que ya haya alguna.
 *
 * La comprobación no es paranoia: el creador puede haber perdido SU sobre —por
 * ejemplo si cambió de modo de guardado y volvió— mientras el resto del grupo
 * conserva el suyo. Estrenar ahí dejaría a todos los demás con una llave que ya
 * no abre los gastos nuevos.
 */
async function estrenarSiElGrupoNoTieneNinguna(
  supabase: SupabaseClient,
  spaceId: string,
  miMiembroId: string,
  publica: JsonWebKey,
  generacion: number
): Promise<CryptoKey | null> {
  const { count, error } = await supabase
    .from('shared_space_claves')
    .select('member_id', { count: 'exact', head: true })
    .eq('space_id', spaceId)

  if (error) throw new ErrorDelAlmacen(error.message, error.code)
  if ((count ?? 0) > 0) return null

  return estrenarClaveDeEspacio(supabase, spaceId, miMiembroId, publica, generacion)
}

/**
 * Le reparte la llave vigente a todos los que están esperando.
 *
 * Lo corre un admin al abrir el grupo. Que sea automático y no un botón es
 * deliberado: "esperando acceso" es un estado que nadie quiere administrar, y
 * el admin ya demostró que puede abrir la llave con sólo entrar. El botón
 * seguiría siendo necesario si repartir fuera una decisión — no lo es: quien
 * está en el grupo tiene que poder leerlo.
 */
export async function repartirLlavePendiente(
  supabase: SupabaseClient,
  spaceId: string,
  generacion: number,
  gek: CryptoKey,
  pendientes: { memberId: string; publica: JsonWebKey }[]
): Promise<number> {
  let dadas = 0

  for (const miembro of pendientes) {
    try {
      await darAccesoAlMiembro(supabase, spaceId, generacion, gek, miembro)
      dadas++
    } catch {
      // Uno que falla no puede frenar a los demás: el próximo intento lo agarra.
    }
  }

  return dadas
}
