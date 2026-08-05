// Solo para el servidor: se usa desde Server Components y Server Actions.
//
// Vive aparte de `currency-mode.ts` porque ese módulo lo importa
// `currency-provider.tsx`, que es un componente de cliente. Aunque de allá
// solo tome constantes, tener `next/headers` en el mismo archivo mete la API
// de servidor en el grafo del bundle del cliente y el build falla con
// "You're importing a module that depends on next/headers".
import { cookies } from 'next/headers'
import { COOKIE_MONEDA, normalizarModo } from './currency-mode'
import type { Moneda } from './types'

/** Moneda activa según la cookie. */
export async function leerModoMoneda(): Promise<Moneda> {
  const almacen = await cookies()
  return normalizarModo(almacen.get(COOKIE_MONEDA)?.value)
}
