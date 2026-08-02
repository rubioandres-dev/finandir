import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 *
 * En Next.js 16 `cookies()` es asíncrono, por eso la función es `async` y
 * SIEMPRE debe crearse dentro de la función que la usa (nunca a nivel de
 * módulo): el store de cookies es propio de cada request.
 *
 *   const supabase = await createClient()
 *   const { data: { user } } = await supabase.auth.getUser()
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Completá .env.local y reiniciá el servidor de desarrollo.'
    )
  }

  const cookieStore = await cookies()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Los Server Components no pueden escribir cookies: Next lanza acá.
          // Es esperable e inofensivo SIEMPRE QUE exista un middleware que
          // refresque la sesión (todavía no creado en este proyecto).
        }
      },
    },
  })
}
