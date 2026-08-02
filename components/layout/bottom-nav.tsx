'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HandCoins,
  LayoutDashboard,
  Settings,
  TrendingUp,
  Wallet,
} from 'lucide-react'

const PESTANAS = [
  { href: '/dashboard', etiqueta: 'Inicio', Icono: LayoutDashboard },
  { href: '/dashboard/fire', etiqueta: 'FIRE', Icono: TrendingUp },
  { href: '/dashboard/accounts', etiqueta: 'Cuentas', Icono: Wallet },
  { href: '/dashboard/debts', etiqueta: 'Deudas', Icono: HandCoins },
  { href: '/dashboard/settings', etiqueta: 'Ajustes', Icono: Settings },
] as const

export function BottomNav() {
  const ruta = usePathname()

  return (
    <nav
      aria-label="Navegación principal"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/80 backdrop-blur-lg md:hidden"
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
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  activa ? 'text-primary' : 'text-subtle hover:text-foreground'
                }`}
              >
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
