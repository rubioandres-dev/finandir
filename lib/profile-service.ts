// Solo para el servidor: se usa desde Server Components y Server Actions.
import type { SupabaseClient } from '@supabase/supabase-js'
import { LOCALE_POR_DEFECTO, normalizarLocale, type Locale } from './formatters'
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
  /** Formato regional activo. Cae a es-AR si falta la 009. */
  locale: Locale
  /** true si `user_profiles` todavía no existe en la base. */
  faltaMigracion: boolean
}

/** Códigos de PostgREST/Postgres para "esa relación no existe". */
function esTablaFaltante(codigo: string | undefined): boolean {
  return codigo === '42P01' || codigo === 'PGRST205' || codigo === 'PGRST204'
}

/** Códigos para "esa columna no existe": falta la 009. */
function esColumnaFaltante(codigo: string | undefined): boolean {
  return codigo === '42703' || codigo === 'PGRST204'
}

const CONTEXTO_POR_DEFECTO = (): Omit<ContextoDePerfil, 'faltaMigracion'> => ({
  perfil: null,
  monedas: [...MONEDAS_POR_DEFECTO],
  locale: LOCALE_POR_DEFECTO,
})

export async function cargarPerfil(
  supabase: SupabaseClient,
  userId: string
): Promise<ContextoDePerfil> {
  const COLUMNAS =
    'user_id, display_name, selected_currencies, onboarding_completed, updated_at, locale'

  let { data, error } = await supabase
    .from('user_profiles')
    .select(COLUMNAS)
    .eq('user_id', userId)
    .maybeSingle()

  // Sin la 009 no existe `locale` y PostgREST rechaza el select entero. Se
  // reintenta sin esa columna: el resto del perfil sigue sirviendo y el
  // formato cae a es-AR, que es lo que la app hacía antes de la migración.
  if (error && esColumnaFaltante(error.code)) {
    ;({ data, error } = await supabase
      .from('user_profiles')
      .select(COLUMNAS.replace(', locale', ''))
      .eq('user_id', userId)
      .maybeSingle())
  }

  if (error) {
    if (esTablaFaltante(error.code)) {
      return { ...CONTEXTO_POR_DEFECTO(), faltaMigracion: true }
    }
    console.error('[profile] no se pudo leer el perfil', error.message)
    return { ...CONTEXTO_POR_DEFECTO(), faltaMigracion: false }
  }

  // Sin fila todavía: el usuario existe pero nunca pasó por el onboarding.
  if (!data) {
    return { ...CONTEXTO_POR_DEFECTO(), faltaMigracion: false }
  }

  const fila = data as Record<string, unknown>
  const monedas = normalizarListaDeMonedas(fila.selected_currencies)
  const locale = normalizarLocale(fila.locale as string | null)

  return {
    perfil: {
      user_id: fila.user_id as string,
      display_name: (fila.display_name as string | null) ?? null,
      selected_currencies: monedas,
      locale,
      onboarding_completed: Boolean(fila.onboarding_completed),
      updated_at: (fila.updated_at as string | null) ?? null,
    },
    monedas,
    locale,
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
    locale?: Locale
    onboarding_completed?: boolean
  }
): Promise<{ ok: true } | { ok: false; error: string; faltaMigracion: boolean }> {
  let { error } = await supabase
    .from('user_profiles')
    .upsert({ user_id: userId, ...cambios }, { onConflict: 'user_id' })

  // Igual que en la lectura: sin la 009 la columna `locale` no existe y el
  // upsert entero rebota. Se reintenta sin ella para no perder el resto del
  // cambio; el aviso de que falta la migración lo da la UI de Ajustes.
  if (error && cambios.locale !== undefined && esColumnaFaltante(error.code)) {
    const { locale: _descartado, ...resto } = cambios
    void _descartado
    ;({ error } = await supabase
      .from('user_profiles')
      .upsert({ user_id: userId, ...resto }, { onConflict: 'user_id' }))
  }

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
