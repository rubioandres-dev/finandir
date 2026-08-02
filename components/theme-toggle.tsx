'use client'

import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

/**
 * Equivalente a `mounted`, pero sin `setState` dentro de un efecto: React 19
 * marca ese patrón como renders en cascada (react-hooks/set-state-in-effect).
 * El snapshot del servidor es false y el del cliente true, que es exactamente
 * la semántica de "ya montó".
 */
const sinSuscripcion = () => () => {}
const enCliente = () => true
const enServidor = () => false

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  // El tema real solo se conoce en el cliente. Hasta montar renderizamos un
  // placeholder del mismo tamaño: evita el desajuste de hidratación y que el
  // header salte cuando aparece el botón.
  const montado = useSyncExternalStore(sinSuscripcion, enCliente, enServidor)

  if (!montado) {
    return <div className="size-9 shrink-0" aria-hidden />
  }

  const esOscuro = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(esOscuro ? 'light' : 'dark')}
      aria-label={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={esOscuro ? 'Modo claro' : 'Modo oscuro'}
      className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-foreground/5 hover:text-foreground"
    >
      {esOscuro ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  )
}
