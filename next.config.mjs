import withPWAInit from '@ducanh2912/next-pwa'

const isDev = process.env.NODE_ENV === 'development'

const withPWA = withPWAInit({
  dest: 'public',
  // El service worker solo se genera y registra en producción: en desarrollo
  // cachearía assets viejos y arruinaría el hot reload.
  disable: isDev,
  register: true,
  reloadOnOnline: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  workboxOptions: {
    disableDevLogs: true,
    // Nunca cachear las respuestas de la API ni las rutas de auth.
    exclude: [/^\/api\//, /^\/auth\//],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite compilar a otra carpeta (NEXT_DIST_DIR=.next-check npm run build)
  // sin pisar el .next que está usando un `next dev` en paralelo.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // next-pwa inyecta SIEMPRE una función `webpack` en la config, incluso con
  // `disable: true`. Next 16 usa Turbopack por defecto y aborta al ver un
  // `webpack` sin un `turbopack` que lo acompañe. Este objeto vacío declara
  // "en Turbopack no necesito configuración extra" y silencia el error.
  //
  // Reparto de bundlers:
  //   dev   -> Turbopack (el PWA está desactivado, no hace falta webpack)
  //   build -> webpack, vía `next build --webpack` en package.json
  //            (obligatorio: con Turbopack no se genera el service worker)
  turbopack: {},
}

export default withPWA(nextConfig)
