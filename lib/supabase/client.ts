import { createBrowserClient } from '@supabase/ssr'

/**
 * Cliente de Supabase para Client Components ('use client').
 *
 * `createBrowserClient` ya devuelve una instancia memoizada por par
 * (url, key), así que es seguro llamar a `createClient()` en cada
 * componente/render sin abrir múltiples conexiones de realtime.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Completá .env.local y reiniciá el servidor de desarrollo.'
    )
  }

  return createBrowserClient(url, anonKey)
}
