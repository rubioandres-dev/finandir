import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AUREM',
    short_name: 'AUREM',
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
    // Atajos del launcher: al mantener presionado el ícono de AUREM, Android
    // ofrece estas tres acciones. Los dos primeros entran por /dashboard con
    // un ?action= que el dashboard consume para abrir la hoja correspondiente.
    // Android muestra como máximo 4 (en la práctica 3 en la mayoría de los
    // launchers), así que el orden acá es el orden de prioridad.
    shortcuts: [
      {
        name: 'Registrar Gasto',
        short_name: 'Nuevo Gasto',
        description: 'Registrar gasto por voz o texto',
        url: '/dashboard?action=new-expense',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Escanear Comprobante',
        short_name: 'Escanear',
        description: 'Fotografiar ticket o factura con IA',
        url: '/dashboard?action=scan-receipt',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Ver Consolidado',
        short_name: 'Balance',
        description: 'Consultar balance y patrimonio',
        url: '/dashboard/consolidated',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  }
}
