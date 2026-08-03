'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/**
 * AUREM es un sistema noir: no hay modo claro que elegir.
 *
 * Se mantiene next-themes con `forcedTheme` para que la clase .dark siga
 * presente en <html> —de ella cuelgan las variantes `dark:` que ya usan los
 * componentes— sin leer ni escribir la preferencia del sistema.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      forcedTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
