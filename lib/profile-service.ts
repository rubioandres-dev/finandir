// Solo para el servidor: se usa desde Server Components y Server Actions.
import type { SupabaseClient } from '@supabase/supabase-js'
import { MONEDAS_POR_DEFECTO, normalizarListaDeMonedas } from './monedas'
import type { Moneda, UserProfile } from './types'

/**
 * Perfil del usuario y sus divisas de trabajo.
 *
 * DEGRADACIÓN SI LA 007 NO ESTÁ CORRIDA
 *
 * La migración la aplica una persona en el SQL Editor, no el deploy. Así que
 * este módulo tiene que sobrevivir a que la tabla no exista, y no con un
 * cartel de error: cayendo al comportamiento anterior a las divisas dinámicas
 * (ARS + USD, sin onboarding). Un modal de onboarding que no puede guardar
 * sería peor que no tener onboarding.
 *
 * Ese es el sentido de `faltaMigracion`: quien lo reciba muestra el aviso
 * donde corresponda, pero la app funciona igual.
 */

export type ContextoDePerfil = {
  perfil: UserProfile | null
  /** Divisas activas, ya normalizadas y nunca vacías. La primera es la principal. */
  monedas: Moneda[]
  /** true si `user_profiles` todavía no existe en la base. */
  faltaMigracion: boolean
}

/** Códigos de PostgREST/Postgres para "esa relación no existe". */
function esTablaFaltante(codigo: string | undefined): boolean {
  return codigo === '42P01' || codigo === 'PGRST205' || codigo === 'PGRST204'
}

export async function cargarPerfil(
  supabase: SupabaseClient,
  userId: string
): Promise<ContextoDePerfil> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, selected_currencies, onboarding_completed, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (esTablaFaltante(error.code)) {
      return { perfil: null, monedas: [...MONEDAS_POR_DEFECTO], faltaMigracion: true }
    }
    console.error('[profile] no se pudo leer el perfil', error.message)
    return { perfil: null, monedas: [...MONEDAS_POR_DEFECTO], faltaMigracion: false }
  }

  // Sin fila todavía: el usuario existe pero nunca pasó por el onboarding.
  if (!data) {
    return { perfil: null, monedas: [...MONEDAS_POR_DEFECTO], faltaMigracion: false }
  }

  const monedas = normalizarListaDeMonedas(data.selected_currencies)

  return {
    perfil: {
      user_id: data.user_id as string,
      display_name: (data.display_name as string | null) ?? null,
      selected_currencies: monedas,
      onboarding_completed: Boolean(data.onboarding_completed),
      updated_at: (data.updated_at as string | null) ?? null,
    },
    monedas,
    faltaMigracion: false,
  }
}

/**
 * Guarda las preferencias, creando la fila si es la primera vez.
 *
 * `upsert` y no `update`: el perfil no se crea con un trigger en el signup
 * (eso pediría tocar `auth.users`, que es de Supabase), así que la primera
 * escritura es la que lo materializa.
 */
export async function guardarPerfil(
  supabase: SupabaseClient,
  userId: string,
  cambios: {
    display_name?: string | null
    selected_currencies?: Moneda[]
    onboarding_completed?: boolean
  }
): Promise<{ ok: true } | { ok: false; error: string; faltaMigracion: boolean }> {
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ user_id: userId, ...cambios }, { onConflict: 'user_id' })

  if (error) {
    if (esTablaFaltante(error.code)) {
      return {
        ok: false,
        faltaMigracion: true,
        error:
          'Falta correr migrations/007_user_profiles_and_currencies.sql en el SQL Editor de Supabase.',
      }
    }
    return { ok: false, faltaMigracion: false, error: `No se pudo guardar: ${error.message}` }
  }

  return { ok: true }
}
