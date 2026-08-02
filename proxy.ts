import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * En Next.js 16 el archivo `middleware.ts` pasó a llamarse `proxy.ts` y la
 * función exportada `middleware` a `proxy`. La lógica es la misma.
 *
 * Responsabilidades:
 *  1. Refrescar el token de Supabase en cada request (los Server Components no
 *     pueden escribir cookies, así que este es el único lugar donde la sesión
 *     se renueva).
 *  2. Redirigir a /login cuando se pide /dashboard sin sesión.
 *  3. Redirigir a /dashboard cuando alguien ya logueado va a /login o /signup.
 */
const RUTAS_PROTEGIDAS = ['/dashboard']
const RUTAS_SOLO_ANONIMOS = ['/login', '/signup']

export async function proxy(request: NextRequest) {
  // Esta respuesta acumula las cookies actualizadas por Supabase.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  // IMPORTANTE: getUser() valida el token contra el servidor de Supabase y,
  // de paso, dispara el refresh. No usar getSession() acá: lee la cookie sin
  // verificarla, así que es falsificable.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const esProtegida = RUTAS_PROTEGIDAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`)
  )

  if (!user && esProtegida) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Para volver a donde el usuario quería ir después de loguearse.
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  if (user && RUTAS_SOLO_ANONIMOS.includes(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Todas las rutas excepto:
     *  - _next/static, _next/image  (assets del build)
     *  - favicon.ico, sw.js, workbox-*, manifest.webmanifest (PWA)
     *  - archivos con extensión (imágenes, íconos, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|workbox-.*|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
