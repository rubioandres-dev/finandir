'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeftRight, LayoutDashboard, Settings, TrendingUp } from 'lucide-react'
import { CurrencyToggle } from '@/components/currency-toggle'
import { LogoutButton } from '@/components/logout-button'
import { ThemeToggle } from '@/components/theme-toggle'

const ENLACES = [
  { href: '/dashboard', etiqueta: 'Inicio', Icono: LayoutDashboard },
  { href: '/dashboard/fire', etiqueta: 'FIRE', Icono: TrendingUp },
  { href: '/dashboard/transactions', etiqueta: 'Movimientos', Icono: ArrowLeftRight },
  { href: '/dashboard/settings', etiqueta: 'Ajustes', Icono: Settings },
] as const

export function Header({ email, cotizacion }: { email: string; cotizacion: number | null }) {
  const ruta = usePathname()

  return (
    <header className="safe-top sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-white">
            F
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">Finandir</span>
        </Link>

        {/* Navegación de escritorio; en mobile la reemplaza la barra inferior. */}
        <nav aria-label="Secciones" className="ml-2 hidden items-center gap-0.5 md:flex">
          {ENLACES.map(({ href, etiqueta, Icono }) => {
            const activa = href === '/dashboard' ? ruta === href : ruta.startsWith(href)

            return (
              <Link
                key={href}
                href={href}
                aria-current={activa ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                  activa
                    ? 'bg-foreground/[0.06] text-foreground'
                    : 'text-muted hover:bg-foreground/[0.04] hover:text-foreground'
                }`}
              >
                <Icono className="size-4" aria-hidden />
                {etiqueta}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <CurrencyToggle cotizacion={cotizacion} />
          <ThemeToggle />
          <span
            className="hidden max-w-[14ch] truncate text-xs text-subtle lg:inline"
            title={email}
          >
            {email}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}
