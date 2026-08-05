'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, LayoutDashboard, TrendingDown, Wallet } from 'lucide-react'

const PESTANAS = [
  { href: '/dashboard', etiqueta: 'Inicio', Icono: LayoutDashboard },
  { href: '/dashboard/accounts', etiqueta: 'Cuentas', Icono: Wallet },
  { href: '/dashboard/commitments', etiqueta: 'Cuotas', Icono: TrendingDown },
  { href: '/dashboard/calendar', etiqueta: 'Calendario', Icono: CalendarDays },
] as const

export function BottomNav() {
  const ruta = usePathname()

  return (
    <nav
      aria-label="Navegación principal"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-glass-stroke bg-background/80 backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto flex w-full max-w-2xl items-stretch">
        {PESTANAS.map(({ href, etiqueta, Icono }) => {
          // /dashboard sería prefijo de todas: solo coincide exacto.
          const activa = href === '/dashboard' ? ruta === href : ruta.startsWith(href)

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={activa ? 'page' : undefined}
                className={`relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium tracking-wide transition active:scale-90 ${
                  activa ? 'text-gold-leaf' : 'text-on-surface-variant/70 hover:text-gold-leaf/80'
                }`}
              >
                {/* Filamento dorado sobre la pestaña activa. */}
                {activa && (
                  <span
                    className="fire-gradient glow-gold absolute inset-x-5 top-0 h-0.5 rounded-full"
                    aria-hidden
                  />
                )}
                <Icono className="size-[22px]" strokeWidth={activa ? 2.4 : 1.8} aria-hidden />
                {etiqueta}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
