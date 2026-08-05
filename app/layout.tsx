import type { Metadata, Viewport } from 'next'
import { Geist_Mono, Inter, Montserrat } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

/** Cuerpo de texto: Inter, por su altura de x y sus cifras tabulares. */
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

/** Títulos y versalitas AUREM: Montserrat, geométrica y con carácter. */
const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: 'Finandir',
    // Cualquier página que defina su propio título queda como "X · Finandir".
    template: '%s · Finandir',
  },
  description: 'Gestión de finanzas personales: cuentas, gastos e ingresos.',
  applicationName: 'Finandir',
}

export const viewport: Viewport = {
  // viewport-fit=cover habilita env(safe-area-inset-*) en pantallas con notch.
  viewportFit: 'cover',
  // AUREM es noir siempre: un solo color de barra de estado.
  themeColor: '#0a0c14',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // Sin clase de tema acá: la pone next-themes antes del primer pintado, con
    // el valor guardado. Si se hardcodeara `dark`, el tema elegido perdería.
    <html
      lang="es-AR"
      suppressHydrationWarning
      className={`${inter.variable} ${montserrat.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
