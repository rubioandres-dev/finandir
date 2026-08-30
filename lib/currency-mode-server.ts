// Solo para el servidor: se usa desde Server Components y Server Actions.
//
// Vive aparte de `currency-mode.ts` porque ese módulo lo importa
// `currency-provider.tsx`, que es un componente de cliente. Aunque de allá
// solo tome constantes, tener `next/headers` en el mismo archivo mete la API
// de servidor en el grafo del bundle del cliente y el build falla con
// "You're importing a module that depends on next/headers".
import { cookies } from 'next/headers'
import { cache } from 'react'
import { COOKIE_MONEDA, normalizarModo } from './currency-mode'
import { LOCALE_POR_DEFECTO } from './formatters'
import { IDIOMA_POR_DEFECTO } from './i18n'
import { MONEDAS_POR_DEFECTO } from './monedas'
import { COOKIE_PRIVACIDAD, COOKIE_PRIVACIDAD_SESION, estaOculto } from './privacy-mode'
import { cargarPerfil, type ContextoDePerfil } from './profile-service'
import { createClient } from './supabase/server'
import type { Moneda } from './types'

/**
 * Moneda activa según la cookie, acotada a las divisas que el usuario eligió.
 *
 * Preferí `cargarContextoDeMonedas()` en las vistas: esta función sola no sabe
 * qué divisas tiene el perfil y por eso asume el par por defecto.
 */
export async function leerModoMoneda(
  permitidas: Moneda[] = MONEDAS_POR_DEFECTO
): Promise<Moneda> {
  const almacen = await cookies()
  return normalizarModo(almacen.get(COOKIE_MONEDA)?.value, permitidas)
}

export type ContextoDeMonedas = ContextoDePerfil & {
  /** Divisa activa del header, garantizada dentro de `monedas`. */
  modo: Moneda
  /** Modo privado: los importes se renderizan enmascarados. */
  oculto: boolean
  /** Solo la preferencia de Ajustes, sin el override del ojito. */
  ocultoPorDefecto: boolean
}

/**
 * ¿Los importes van tapados en esta request?
 *
 * Se lee en el servidor porque media app formatea los importes ahí: si esto
 * viviera solo en el cliente, el HTML saldría con los números en claro y se
 * taparían después, a la vista.
 */
export async function leerPrivacidad(): Promise<{ oculto: boolean; porDefecto: boolean }> {
  const almacen = await cookies()
  const preferencia = almacen.get(COOKIE_PRIVACIDAD)?.value

  return {
    oculto: estaOculto(preferencia, almacen.get(COOKIE_PRIVACIDAD_SESION)?.value),
    // Sin la cookie de sesión: es la preferencia sola, que es lo que Ajustes
    // tiene que mostrar tildado aunque el ojito esté diciendo otra cosa.
    porDefecto: estaOculto(preferencia, undefined),
  }
}

/**
 * Todo lo que una vista necesita saber sobre monedas, en una sola llamada.
 *
 * Está envuelto en `cache()` de React: el layout y la página de la misma
 * request lo piden por separado, y sin esto serían dos consultas a
 * `user_profiles` por render. `cache` dedupe dentro del mismo pase de render,
 * que es exactamente el alcance que queremos (no queremos que sobreviva a un
 * `router.refresh()` después de cambiar las divisas).
 *
 * Si no hay sesión devuelve el default y no consulta nada: quien llame ya se
 * encarga de redirigir a /login.
 */
export const cargarContextoDeMonedas = cache(async (): Promise<ContextoDeMonedas> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      perfil: null,
      monedas: [...MONEDAS_POR_DEFECTO],
      locale: LOCALE_POR_DEFECTO,
      idioma: IDIOMA_POR_DEFECTO,
      xp: 0,
      tier: 'BRONZE',
      modulos: {},
      faltaMigracion: false,
      modo: MONEDAS_POR_DEFECTO[0],
      oculto: false,
      ocultoPorDefecto: false,
    }
  }

  const contexto = await cargarPerfil(supabase, user.id)
  const modo = await leerModoMoneda(contexto.monedas)
  const privacidad = await leerPrivacidad()

  return { ...contexto, modo, oculto: privacidad.oculto, ocultoPorDefecto: privacidad.porDefecto }
})
