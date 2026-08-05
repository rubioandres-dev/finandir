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
import { MONEDAS_POR_DEFECTO } from './monedas'
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
      faltaMigracion: false,
      modo: MONEDAS_POR_DEFECTO[0],
    }
  }

  const contexto = await cargarPerfil(supabase, user.id)
  const modo = await leerModoMoneda(contexto.monedas)

  return { ...contexto, modo }
})
