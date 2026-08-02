'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/**
 * next-themes inyecta un script inline que fija la clase en <html> antes del
 * primer pintado. Por eso el <html> del layout raíz lleva
 * suppressHydrationWarning: el script modifica el DOM antes de que React
 * hidrate, y sin eso React reportaría el desajuste como error.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
