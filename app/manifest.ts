import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Finandir',
    short_name: 'Finandir',
    description: 'Gestión de finanzas personales: cuentas, gastos e ingresos.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'es-AR',
    dir: 'ltr',
    // Noir de AUREM. La pantalla de arranque que arma Android al abrir la PWA
    // se pinta con estos dos colores, así que tienen que coincidir con el
    // --midnight-navy del ícono y con el themeColor del layout: si no, la
    // transición hasta la portada pega un flash de otro color.
    background_color: '#0a0c14',
    theme_color: '#0a0c14',
    categories: ['finance', 'productivity'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // Con zona de seguridad: Android recorta este ícono a la forma del
        // launcher (círculo, squircle, etc.).
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
