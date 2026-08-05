'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/**
 * AUREM tiene dos temas: noir (`dark`, el de la marca) y marfil (`light`).
 *
 * `attribute="class"` es lo que hace funcionar el `@custom-variant dark` de
 * globals.css, que mira la clase `.dark` y no `prefers-color-scheme`: sin eso
 * el toggle cambiaría el atributo y ninguna utilidad `dark:` se enteraría.
 *
 * El default es noir incluso con `enableSystem`: la identidad de la marca es
 * el noir, y el marfil aparece solo si el usuario lo elige. Elegir "Sistema"
 * en el menú de perfil sí delega en `prefers-color-scheme`.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}
