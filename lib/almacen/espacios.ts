/**
 * LLAVES DE GRUPO, CONTRA LA BASE
 * =============================================================================
 *
 * `grupos.ts` hace la criptografía y no sabe de Supabase. Esto la conecta con
 * las tablas de `migrations/020_llaves_de_grupo.sql`.
 *
 * EL FLUJO, DE PUNTA A PUNTA
 *
 *   1. el miembro PUBLICA su clave pública en su fila de `shared_space_members`
 *   2. un admin, que puede abrir la GEK, se la ENVUELVE con esa pública
 *   3. el miembro la abre con su privada y ya lee los gastos del grupo
 *
 * Entre el 1 y el 2 el recién llegado está adentro del grupo y no ve sus datos.
 * Es un estado legítimo y no hace falta una tabla de solicitudes para
 * representarlo: "pidió entrar" es "está y todavía no tiene sobre".
 *
 * POR QUÉ NO HAY UN `crearGrupoYRepartir` QUE HAGA TODO
 *
 * Porque los pasos los hacen personas distintas en momentos distintos. Meterlos
 * en una función obligaría a que el que crea el grupo tenga a mano las públicas
 * de gente que todavía no entró.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  abrirClaveDeGrupo,
  crearClaveDeGrupo,
  envolverParaMiembro,
  importarPublica,
  rotarClaveDeGrupo,
  type ClavePublica,
  type MiembroConClave,
} from './grupos'
import { ErrorDelAlmacen } from './tipos'

function fallar(error: { message: string; code?: string }): never {
  throw new ErrorDelAlmacen(error.message, error.code)
}

/**
 * Publica la clave pública del miembro en su propia fila.
 *
 * La escribe el PROPIO miembro y nadie más: la RLS de `shared_space_members` ya
 * limita el update a la fila de uno. Un invitado sin cuenta no tiene clave y no
 * la necesita — es un dato adentro del grupo, no alguien que lee.
 */
export async function publicarClavePublica(
  supabase: SupabaseClient,
  memberId: string,
  publica: ClavePublica
): Promise<void> {
  const { error } = await supabase
    .from('shared_space_members')
    .update({ clave_publica: publica })
    .eq('id', memberId)

  if (error) fallar(error)
}

export type MiembroDelEspacio = {
  memberId: string
  userId: string | null
  esAdmin: boolean
  publica: ClavePublica | null
  /** `true` si todavía nadie le envolvió la clave de la generación vigente. */
  pendiente: boolean
}

/**
 * Quién está en el espacio, quién puede leer y a quién le falta la llave.
 *
 * Es lo que necesita la pantalla de miembros para mostrar "esperando acceso" y
 * ofrecerle a un admin el botón de darle la llave.
 */
export async function miembrosDelEspacio(
  supabase: SupabaseClient,
  spaceId: string,
  generacion: number
): Promise<MiembroDelEspacio[]> {
  const [resMiembros, resClaves] = await Promise.all([
    supabase
      .from('shared_space_members')
      .select('id, user_id, role, clave_publica')
      .eq('space_id', spaceId),
    supabase
      .from('shared_space_claves')
      .select('member_id')
      .eq('space_id', spaceId)
      .eq('generacion', generacion),
  ])

  if (resMiembros.error) fallar(resMiembros.error)
  if (resClaves.error) fallar(resClaves.error)

  const conLlave = new Set((resClaves.data ?? []).map((c) => c.member_id as string))

  return (resMiembros.data ?? []).map((m) => ({
    memberId: m.id as string,
    userId: (m.user_id as string | null) ?? null,
    esAdmin: m.role === 'ADMIN',
    publica: (m.clave_publica as ClavePublica | null) ?? null,
    // Un invitado sin cuenta nunca está pendiente: no es alguien que lea.
    pendiente: m.user_id !== null && !conLlave.has(m.id as string),
  }))
}

/**
 * TODAS las claves del miembro en ese espacio, por generación.
 *
 * No alcanza con la última: una rotación deja filas escritas con la llave vieja
 * hasta que alguien las re-cifra, y cada fila dice con qué generación se
 * escribió. Quedarse con la última haría desaparecer justo los gastos
 * anteriores a la expulsión, que son los que uno quiere seguir viendo.
 *
 * Una generación que no abre se saltea: puede ser un sobre de una rotación que
 * quedó a medias, y no es motivo para dejar al miembro sin las que sí abren.
 */
export async function clavesDelEspacio(
  supabase: SupabaseClient,
  spaceId: string,
  memberId: string,
  privada: CryptoKey
): Promise<Map<number, CryptoKey>> {
  const { data, error } = await supabase
    .from('shared_space_claves')
    .select('generacion, clave_envuelta')
    .eq('space_id', spaceId)
    .eq('member_id', memberId)
    .order('generacion', { ascending: false })

  if (error) fallar(error)

  const claves = new Map<number, CryptoKey>()

  for (const fila of (data ?? []) as { generacion: number; clave_envuelta: string }[]) {
    try {
      claves.set(
        fila.generacion,
        await abrirClaveDeGrupo(
          { generacion: fila.generacion, claveEnvuelta: fila.clave_envuelta },
          privada
        )
      )
    } catch {
      /* Sobre que no abre: esa generación no se ve, las otras sí. */
    }
  }

  return claves
}

/** La clave del grupo, abierta con la privada del miembro. */
export async function abrirClaveDelEspacio(
  supabase: SupabaseClient,
  spaceId: string,
  memberId: string,
  privada: CryptoKey
): Promise<CryptoKey | null> {
  const { data, error } = await supabase
    .from('shared_space_claves')
    .select('generacion, clave_envuelta')
    .eq('space_id', spaceId)
    .eq('member_id', memberId)
    .order('generacion', { ascending: false })
    .limit(1)
    .maybeSingle<{ generacion: number; clave_envuelta: string }>()

  if (error) fallar(error)
  // Sin sobre: está en el grupo y todavía no le dieron la llave.
  if (!data) return null

  // La columna es `clave_envuelta` y el tipo del dominio `claveEnvuelta`: pasar
  // la fila directo dejaba el campo en undefined y NINGUNA llave se abria.
  return abrirClaveDeGrupo(
    { generacion: data.generacion, claveEnvuelta: data.clave_envuelta },
    privada
  )
}

/**
 * Crea la clave de un espacio nuevo y se la envuelve a su creador.
 *
 * El creador es el único miembro que existe en ese momento, así que esto y el
 * alta del espacio van juntos.
 */
export async function estrenarClaveDeEspacio(
  supabase: SupabaseClient,
  spaceId: string,
  memberId: string,
  publica: ClavePublica,
  // Casi siempre 1. Puede ser mayor en un grupo que rotó antes de tener llaves:
  // `shared_spaces.generacion` manda, porque es contra ese número que se van a
  // escribir los gastos.
  generacion = 1
): Promise<CryptoKey> {
  const gek = await crearClaveDeGrupo()
  const sobre = await envolverParaMiembro(gek, await importarPublica(publica), generacion)

  const { error } = await supabase.from('shared_space_claves').insert({
    space_id: spaceId,
    member_id: memberId,
    generacion,
    clave_envuelta: sobre.claveEnvuelta,
  })

  if (error) fallar(error)
  return gek
}

/**
 * Le da la llave a alguien que ya está en el grupo.
 *
 * Sólo puede llamarla quien PUEDA ABRIR la GEK, porque hay que tenerla para
 * envolverla. Eso es lo que hace que "admin" sea una capacidad y no un rótulo:
 * marcarse admin sin la llave no habilita nada.
 */
export async function darAccesoAlMiembro(
  supabase: SupabaseClient,
  spaceId: string,
  generacion: number,
  gek: CryptoKey,
  miembro: MiembroConClave
): Promise<void> {
  const sobre = await envolverParaMiembro(
    gek,
    await importarPublica(miembro.publica),
    generacion
  )

  const { error } = await supabase.from('shared_space_claves').upsert(
    {
      space_id: spaceId,
      member_id: miembro.memberId,
      generacion,
      clave_envuelta: sobre.claveEnvuelta,
    },
    { onConflict: 'space_id,member_id,generacion' }
  )

  if (error) fallar(error)
}

export type ResultadoDeExpulsion = {
  generacion: number
  gek: CryptoKey
}

/**
 * Saca a alguien del grupo y rota la clave.
 *
 * EL ORDEN: PRIMERO SE VA, DESPUÉS SE ROTA
 *
 * Acá decía lo contrario, con el argumento de que un corte en el medio dejaría
 * al grupo sin nadie con llave vigente. Era falso: los que quedan conservan la
 * llave de la generación actual, y los gastos siguen escritos con esa misma
 * generación hasta que alguien los re-cifre. Rotar primero no protege a nadie.
 *
 * Y costaba caro. Si el borrado no surtía efecto —la policy de la 015 no dejaba
 * a un admin sacar a alguien con cuenta, y PostgREST devuelve éxito al borrar
 * cero filas— quedaba un "miembro sin llave de la generación vigente", que es
 * exactamente el estado que el reparto automático corrige dándole la llave
 * nueva. La expulsión se deshacía sola y sin un error a la vista.
 *
 * Al revés, un corte después del borrado deja al expulsado afuera y al grupo
 * andando con la llave vieja: se reintenta y listo.
 *
 * SE VERIFICA QUE HAYA SALIDO
 *
 * No alcanza con que el DELETE no tire error: hay que mirar que la fila no
 * esté. Un borrado que la RLS descarta en silencio es la forma más cara de
 * fallar que tiene esta función.
 *
 * LO QUE ESTO **NO** HACE: re-cifrar los gastos que ya existen. Quien llame
 * tiene que hacerlo con la GEK que devuelve, o el expulsado sigue pudiendo leer
 * lo viejo con su clave anterior. Se devuelve la clave justamente para que ese
 * paso no se pueda olvidar sin que se note.
 */
export async function expulsarYRotar(
  supabase: SupabaseClient,
  spaceId: string,
  generacionActual: number,
  quedan: MiembroConClave[],
  memberIdExpulsado: string
): Promise<ResultadoDeExpulsion> {
  // Borrar al miembro se lleva sus sobres por la FK en cascada.
  const { error: errorMiembro } = await supabase
    .from('shared_space_members')
    .delete()
    .eq('id', memberIdExpulsado)
  if (errorMiembro) fallar(errorMiembro)

  const { data: sigue, error: errorLectura } = await supabase
    .from('shared_space_members')
    .select('id')
    .eq('id', memberIdExpulsado)
    .maybeSingle<{ id: string }>()
  if (errorLectura) fallar(errorLectura)

  if (sigue) {
    throw new ErrorDelAlmacen(
      'No se pudo sacar del grupo: hace falta ser administrador. ' +
        'Si sos admin y sigue pasando, corré migrations/024_expulsar_de_verdad.sql.',
      'NO_SE_PUDO_EXPULSAR'
    )
  }

  const rotacion = await rotarClaveDeGrupo(generacionActual, quedan)

  const { error: errorClaves } = await supabase.from('shared_space_claves').insert(
    rotacion.sobres.map((s) => ({
      space_id: spaceId,
      member_id: s.memberId,
      generacion: rotacion.generacion,
      clave_envuelta: s.sobre.claveEnvuelta,
    }))
  )
  if (errorClaves) fallar(errorClaves)

  const { error: errorEspacio } = await supabase
    .from('shared_spaces')
    .update({ generacion: rotacion.generacion })
    .eq('id', spaceId)
  if (errorEspacio) fallar(errorEspacio)

  return { generacion: rotacion.generacion, gek: rotacion.gek }
}
