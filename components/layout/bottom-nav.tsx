'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useState } from 'react'
import { ArrowLeftRight, LayoutDashboard, Menu, TrendingUp, Wallet } from 'lucide-react'
import { MoreMenuDrawer } from '@/components/layout/more-menu-drawer'

/**
 * Las cuatro de uso diario. El resto vive en la bandeja "Más".
 *
 * Antes acá estaban Inicio, Cuentas, Cuotas y Calendario. Movimientos —la
 * pantalla donde uno entra a ver qué gastó— quedaba fuera de la barra y solo
 * se llegaba desde el enlace del dashboard o desde el menú de escritorio, que
 * en mobile no existe. Inversiones tenía el mismo problema.
 */
const PESTANAS = [
  { href: '/dashboard', etiqueta: 'Inicio', Icono: LayoutDashboard },
  { href: '/dashboard/accounts', etiqueta: 'Cuentas', Icono: Wallet },
  { href: '/dashboard/transactions', etiqueta: 'Movimientos', Icono: ArrowLeftRight },
  { href: '/dashboard/investments', etiqueta: 'Inversiones', Icono: TrendingUp },
] as const

/** Las rutas que viven en la bandeja: con cualquiera de ellas, "Más" va activo. */
const RUTAS_DEL_MENU = [
  '/dashboard/fire',
  '/dashboard/calendar',
  '/dashboard/debts',
  '/dashboard/smart-spend',
  '/dashboard/consolidated',
  '/dashboard/guide',
  '/dashboard/settings',
  '/dashboard/commitments',
  '/dashboard/cards',
]

const PESTANA =
  'relative flex w-full flex-col items-center gap-1 py-2.5 text-[10px] font-medium tracking-wide transition active:scale-90'

export function BottomNav() {
  const ruta = usePathname()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const cerrarMenu = useCallback(() => setMenuAbierto(false), [])

  // "Más" se marca activo cuando estás parado en alguna de sus secciones: si
  // no, la barra no muestra dónde estás en la mitad de la app.
  const enElMenu = RUTAS_DEL_MENU.some((r) => ruta.startsWith(r))

  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-glass-stroke bg-background/80 backdrop-blur-xl lg:hidden"
      >
        <ul className="safe-x mx-auto flex w-full max-w-2xl items-stretch">
          {PESTANAS.map(({ href, etiqueta, Icono }) => {
            // /dashboard sería prefijo de todas: solo coincide exacto.
            const activa = href === '/dashboard' ? ruta === href : ruta.startsWith(href)

            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={activa ? 'page' : undefined}
                  className={`${PESTANA} ${
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

          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMenuAbierto(true)}
              aria-haspopup="dialog"
              aria-expanded={menuAbierto}
              className={`${PESTANA} cursor-pointer ${
                enElMenu || menuAbierto
                  ? 'text-gold-leaf'
                  : 'text-on-surface-variant/70 hover:text-gold-leaf/80'
              }`}
            >
              {enElMenu && (
                <span
                  className="fire-gradient glow-gold absolute inset-x-5 top-0 h-0.5 rounded-full"
                  aria-hidden
                />
              )}
              <Menu className="size-[22px]" strokeWidth={enElMenu ? 2.4 : 1.8} aria-hidden />
              Más
            </button>
          </li>
        </ul>
      </nav>

      {menuAbierto && <MoreMenuDrawer onCerrar={cerrarMenu} />}
    </>
  )
}
