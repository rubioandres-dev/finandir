'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  Bell,
  CalendarDays,
  HandCoins,
  LayoutDashboard,
  Settings,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react'
import { CurrencySelector } from '@/components/currency-selector'
import { FloatingPanel } from '@/components/layout/floating-panel'
import { ProfileMenu } from '@/components/layout/profile-menu'
import type { Aviso, NivelAurem } from '@/lib/header-data'

const ENLACES = [
  { href: '/dashboard', etiqueta: 'Inicio', Icono: LayoutDashboard },
  { href: '/dashboard/fire', etiqueta: 'FIRE', Icono: TrendingUp },
  { href: '/dashboard/accounts', etiqueta: 'Cuentas', Icono: Wallet },
  { href: '/dashboard/commitments', etiqueta: 'Cuotas', Icono: TrendingDown },
  { href: '/dashboard/calendar', etiqueta: 'Calendario', Icono: CalendarDays },
  { href: '/dashboard/debts', etiqueta: 'Deudas', Icono: HandCoins },
  { href: '/dashboard/transactions', etiqueta: 'Movimientos', Icono: ArrowLeftRight },
  { href: '/dashboard/settings', etiqueta: 'Ajustes', Icono: Settings },
] as const

function Notificaciones({ avisos }: { avisos: Aviso[] }) {
  const [abierto, setAbierto] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const cerrar = useCallback(() => setAbierto(false), [])

  const hayUrgentes = avisos.some((a) => a.urgente)

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((previo) => !previo)}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        aria-label={
          avisos.length === 0
            ? 'Notificaciones: sin avisos'
            : `Notificaciones: ${avisos.length} aviso${avisos.length === 1 ? '' : 's'}`
        }
        className="relative grid size-9 shrink-0 place-items-center rounded-xl border border-glass-stroke/60 text-on-surface-variant transition active:scale-90 hover:border-gold-leaf/60 hover:text-gold-leaf"
      >
        <Bell className="size-[18px]" aria-hidden />
        {avisos.length > 0 && (
          <span
            className={`absolute right-1.5 top-1.5 size-2 rounded-full ring-2 ring-background ${
              hayUrgentes ? 'bg-error-rose' : 'bg-gold-leaf'
            }`}
            aria-hidden
          />
        )}
      </button>

      {abierto && (
        <FloatingPanel
          ancla={boton}
          onCerrar={cerrar}
          ancho="w-72"
          rol="dialog"
          etiqueta="Próximos vencimientos"
        >
          <div className="flex items-center justify-between gap-2 px-2.5 py-2">
            <p className="aurem-caps text-[10px] text-gold-leaf/70">Próximos 7 días</p>
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar notificaciones"
              className="-mr-1 grid size-6 place-items-center rounded-lg text-on-surface-variant transition active:scale-90 hover:bg-gold-leaf/[0.07] hover:text-gold-leaf"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>

          {avisos.length === 0 ? (
            <p className="px-2.5 pb-3 pt-1 text-xs text-subtle">
              No tenés cierres ni vencimientos cerca.
            </p>
          ) : (
            <ul className="flex flex-col">
              {avisos.map((aviso) => (
                <li
                  key={aviso.id}
                  className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition hover:bg-gold-leaf/[0.07]"
                >
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${
                      aviso.urgente ? 'bg-error-rose' : 'bg-gold-leaf'
                    }`}
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-medium">{aviso.titulo}</span>
                    <span
                      className={`text-[11px] ${aviso.urgente ? 'text-error-rose' : 'text-subtle'}`}
                    >
                      {aviso.detalle}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/dashboard/calendar"
            onClick={cerrar}
            className="mt-1 block rounded-xl px-2.5 py-2 text-[11px] font-medium text-gold-leaf transition hover:bg-gold-leaf/[0.07]"
          >
            Ver el calendario completo →
          </Link>
        </FloatingPanel>
      )}
    </>
  )
}

export function Header({
  email,
  nombre,
  cotizacion,
  nivel,
  avisos,
}: {
  email: string
  nombre: string | null
  cotizacion: number | null
  nivel: NivelAurem
  avisos: Aviso[]
}) {
  const ruta = usePathname()

  // z-50, por encima de la barra inferior (z-40): `backdrop-blur` crea un
  // contexto de apilado, así que los paneles de acá no pueden escaparse del
  // z-index del header y quedarían tapados por la barra.
  return (
    <header className="safe-top sticky top-0 z-50 border-b border-glass-stroke/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5">
          <span className="fire-gradient glow-gold grid size-8 place-items-center rounded-xl font-display text-sm font-extrabold text-midnight-navy">
            A
          </span>
          <span className="font-display text-base font-extrabold uppercase tracking-tighter text-gold-leaf">
            Aurem
          </span>
        </Link>

        {/* Navegación de escritorio; en mobile la reemplaza la barra inferior. */}
        <nav aria-label="Secciones" className="ml-2 hidden items-center gap-0.5 lg:flex">
          {ENLACES.map(({ href, etiqueta, Icono }) => {
            const activa = href === '/dashboard' ? ruta === href : ruta.startsWith(href)

            return (
              <Link
                key={href}
                href={href}
                aria-current={activa ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition ${
                  activa
                    ? 'border border-glass-stroke bg-gold-leaf/10 text-gold-leaf'
                    : 'border border-transparent text-on-surface-variant hover:bg-gold-leaf/[0.06] hover:text-gold-leaf'
                }`}
              >
                <Icono className="size-4" aria-hidden />
                {etiqueta}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <CurrencySelector cotizacion={cotizacion} />
          <Notificaciones avisos={avisos} />

          {/* El avatar con aro dorado es el ancla visual del sistema, y ahora
              también el disparador del menú de perfil. */}
          <ProfileMenu email={email} nombre={nombre} />
        </div>
      </div>

      {/* --- Badge de nivel: solo cuando hay una tasa de ahorro que mostrar --- */}
      {nivel.tasaDeAhorro !== null && (
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 pb-2 sm:px-6">
          <span
            className={`aurem-caps shrink-0 rounded-full px-2.5 py-1 text-[9px] ${
              nivel.esGold
                ? 'fire-gradient glow-gold text-midnight-navy'
                : 'border border-glass-stroke text-gold-leaf/80'
            }`}
          >
            {nivel.nombre}
          </span>

          <div
            className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-gold-leaf/10"
            role="progressbar"
            aria-valuenow={Math.round(nivel.progreso * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Avance del nivel Aurem"
          >
            <div
              className="fire-gradient h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.max(3, nivel.progreso * 100)}%` }}
            />
          </div>

          <span className="shrink-0 text-[10px] font-medium tabular-nums text-on-surface-variant">
            {nivel.tasaDeAhorro}% ahorrado
          </span>
        </div>
      )}
    </header>
  )
}
