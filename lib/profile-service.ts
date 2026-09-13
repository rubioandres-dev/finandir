import { LOCALE_POR_DEFECTO, normalizarLocale, type Locale } from './formatters'
import { IDIOMA_POR_DEFECTO, normalizarIdioma, type Idioma } from './i18n'
import { normalizarModulos, type EstadoDeModulos } from './modules'
import { MONEDAS_POR_DEFECTO, normalizarListaDeMonedas } from './monedas'
import type { Libro } from './almacen/libro'
import { FaltaMigracionRelacional } from './almacen/relacional'
import type { Moneda, UserProfile } from './types'

/**
 * Perfil del usuario y sus divisas de trabajo.
 *
 * CORRE EN LOS DOS MUNDOS
 *
 * Recibe un `Libro` y no un cliente de Supabase, así que la misma función sirve
 * para un usuario en modo relacional —el servidor le arma un libro sobre las
 * tablas viejas— y para uno en Bóveda, donde el libro lo arma el navegador
 * sobre bloques cifrados. Las rarezas de PostgREST (columnas que faltan según
 * qué migración esté corrida, `numeric` como string) viven ahora en
 * `lib/almacen/relacional.ts` y no acá.
 *
 * DEGRADACIÓN SI LA 007 NO ESTÁ CORRIDA
 *
 * La migración la aplica una persona en el SQL Editor, no el deploy. Así que
 * esto tiene que sobrevivir a que la tabla no exista, y no con un cartel de
 * error: cayendo al comportamiento anterior a las divisas dinámicas (ARS + USD,
 * sin onboarding). Un modal de onboarding que no puede guardar sería peor que
 * no tener onboarding.
 */

export type ContextoDePerfil = {
  /**
   * `null` sólo si la lectura falló. Un usuario que existe pero nunca pasó por
   * el onboarding trae un perfil EN BLANCO, que para quien lo consume da lo
   * mismo: `onboarding_completed` en false y `display_name` en null llevan al
   * mismo lugar que la ausencia.
   */
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

const CONTEXTO_POR_DEFECTO = (): Omit<ContextoDePerfil, 'faltaMigracion'> => ({
  perfil: null,
  monedas: [...MONEDAS_POR_DEFECTO],
  locale: LOCALE_POR_DEFECTO,
  idioma: IDIOMA_POR_DEFECTO,
  xp: 0,
  tier: 'BRONZE',
  modulos: {},
})

export async function cargarPerfil(libro: Libro): Promise<ContextoDePerfil> {
  let guardado
  try {
    guardado = await libro.leer('perfil')
  } catch (error) {
    if (error instanceof FaltaMigracionRelacional) {
      return { ...CONTEXTO_POR_DEFECTO(), faltaMigracion: true }
    }
    console.error('[profile] no se pudo leer el perfil', error)
    return { ...CONTEXTO_POR_DEFECTO(), faltaMigracion: false }
  }

  // Los valores vacíos que puede traer un perfil a medio armar se normalizan
  // acá y no en el libro: el libro devuelve lo que hay, esto decide qué
  // significa que no haya.
  const monedas = normalizarListaDeMonedas(guardado.selected_currencies)
  const locale = normalizarLocale(guardado.locale || null)
  const idioma = normalizarIdioma(guardado.language || null)
  const modulos = normalizarModulos(guardado.active_modules)

  return {
    perfil: {
      user_id: guardado.user_id,
      display_name: guardado.display_name,
      selected_currencies: monedas,
      locale,
      language: idioma,
      aurem_xp: guardado.aurem_xp,
      aurem_tier: guardado.aurem_tier,
      onboarding_completed: guardado.onboarding_completed,
      updated_at: guardado.updated_at,
    },
    monedas,
    locale,
    idioma,
    xp: guardado.aurem_xp,
    tier: guardado.aurem_tier,
    modulos,
    faltaMigracion: false,
  }
}

export type CambiosDePerfil = {
  display_name?: string | null
  selected_currencies?: Moneda[]
  locale?: Locale
  language?: Idioma
  aurem_xp?: number
  aurem_tier?: string
  active_modules?: EstadoDeModulos
  onboarding_completed?: boolean
}

/**
 * Guarda las preferencias, creando el perfil si es la primera vez.
 *
 * El cambio se expresa como una FUNCIÓN sobre el perfil actual y no como un
 * objeto suelto, porque así lo pide `Libro.mutar`: si otro dispositivo escribió
 * en el medio, la mutación se vuelve a aplicar sobre los datos frescos. Un
 * objeto calculado afuera se re-aplicaría con información vieja.
 */
export async function guardarPerfil(
  libro: Libro,
  cambios: CambiosDePerfil
): Promise<{ ok: true } | { ok: false; error: string; faltaMigracion: boolean }> {
  try {
    await libro.mutar('perfil', (actual) => ({ ...actual, ...cambios }))
    return { ok: true }
  } catch (error) {
    if (error instanceof FaltaMigracionRelacional) {
      return { ok: false, faltaMigracion: true, error: error.message }
    }
    const mensaje = error instanceof Error ? error.message : 'Error desconocido.'
    return { ok: false, faltaMigracion: false, error: `No se pudo guardar: ${mensaje}` }
  }
}
