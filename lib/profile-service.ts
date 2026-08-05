// Solo para el servidor: se usa desde Server Components y Server Actions.
import type { SupabaseClient } from '@supabase/supabase-js'
import { LOCALE_POR_DEFECTO, normalizarLocale, type Locale } from './formatters'
import { IDIOMA_POR_DEFECTO, normalizarIdioma, type Idioma } from './i18n'
import { normalizarModulos, type EstadoDeModulos } from './modules'
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
  /** Idioma de la interfaz. Cae a es-AR si falta la 010. */
  idioma: Idioma
  /** XP y tier del sistema de logros. En cero si falta la 010. */
  xp: number
  tier: string
  /** Módulos apagados por el usuario. Vacío si falta la 011. */
  modulos: EstadoDeModulos
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
  idioma: IDIOMA_POR_DEFECTO,
  xp: 0,
  tier: 'BRONZE',
  modulos: {},
})

export async function cargarPerfil(
  supabase: SupabaseClient,
  userId: string
): Promise<ContextoDePerfil> {
  // Cada nivel agrega las columnas de una migración. Si PostgREST rechaza el
  // select porque falta una columna, se baja un escalón: así el perfil sigue
  // leyéndose con las migraciones que SÍ estén corridas, y lo que falta cae a
  // su valor por defecto en vez de tumbar la app entera.
  const BASE = 'user_id, display_name, selected_currencies, onboarding_completed, updated_at'
  const NIVELES = [
    `${BASE}, locale, language, aurem_xp, aurem_tier, active_modules`, // 007+009+010+011
    `${BASE}, locale, language, aurem_xp, aurem_tier`, // 007 + 009 + 010
    `${BASE}, locale`, // 007 + 009
    BASE, // solo 007
  ]

  let data: Record<string, unknown> | null = null
  let error: { code?: string; message: string } | null = null

  for (const columnas of NIVELES) {
    const respuesta = await supabase
      .from('user_profiles')
      .select(columnas)
      .eq('user_id', userId)
      .maybeSingle()

    data = respuesta.data as Record<string, unknown> | null
    error = respuesta.error

    if (!error || !esColumnaFaltante(error.code)) break
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

  const fila = data
  const monedas = normalizarListaDeMonedas(fila.selected_currencies)
  const locale = normalizarLocale(fila.locale as string | null)
  const idioma = normalizarIdioma(fila.language as string | null)
  const xp = Number(fila.aurem_xp ?? 0)
  const tier = (fila.aurem_tier as string | null) ?? 'BRONZE'
  const modulos = normalizarModulos(fila.active_modules)

  return {
    perfil: {
      user_id: fila.user_id as string,
      display_name: (fila.display_name as string | null) ?? null,
      selected_currencies: monedas,
      locale,
      language: idioma,
      aurem_xp: xp,
      aurem_tier: tier,
      onboarding_completed: Boolean(fila.onboarding_completed),
      updated_at: (fila.updated_at as string | null) ?? null,
    },
    monedas,
    locale,
    idioma,
    xp,
    tier,
    modulos,
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
    language?: Idioma
    aurem_xp?: number
    aurem_tier?: string
    active_modules?: EstadoDeModulos
    onboarding_completed?: boolean
  }
): Promise<{ ok: true } | { ok: false; error: string; faltaMigracion: boolean }> {
  let { error } = await supabase
    .from('user_profiles')
    .upsert({ user_id: userId, ...cambios }, { onConflict: 'user_id' })

  // Igual que en la lectura: si falta una columna, el upsert entero rebota.
  // Se reintenta sin las que dependen de migraciones nuevas para no perder el
  // resto del cambio; el aviso de que falta la migración lo da la UI.
  if (error && esColumnaFaltante(error.code)) {
    const {
      locale: _l,
      language: _i,
      aurem_xp: _x,
      aurem_tier: _t,
      active_modules: _m,
      ...resto
    } = cambios
    void [_l, _i, _x, _t, _m]

    if (Object.keys(resto).length > 0) {
      ;({ error } = await supabase
        .from('user_profiles')
        .upsert({ user_id: userId, ...resto }, { onConflict: 'user_id' }))
    }
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
