'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  BookOpen,
  CalendarDays,
  HandCoins,
  Lightbulb,
  PieChart,
  Rocket,
  Settings,
  Target,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useTraduccion } from '@/components/currency-provider'
import type { Clave } from '@/lib/i18n'

/**
 * Lo que no entra en la barra inferior.
 *
 * El orden no es alfabético ni arbitrario: arriba lo que se consulta seguido
 * (FIRE, calendario), abajo lo que se abre de vez en cuando (guía, ajustes).
 */
const SECCIONES: {
  href: string
  etiqueta: Clave
  detalle: Clave
  Icono: LucideIcon
}[] = [
  {
    href: '/dashboard/goals',
    etiqueta: 'nav.objetivos',
    detalle: 'nav.objetivosDetalle',
    Icono: Target,
  },
  { href: '/dashboard/fire', etiqueta: 'nav.fire', detalle: 'nav.fireDetalle', Icono: Rocket },
  {
    href: '/dashboard/calendar',
    etiqueta: 'nav.calendario',
    detalle: 'nav.calendarioDetalle',
    Icono: CalendarDays,
  },
  {
    href: '/dashboard/debts',
    etiqueta: 'nav.deudas',
    detalle: 'nav.deudasDetalle',
    Icono: HandCoins,
  },
  {
    href: '/dashboard/smart-spend',
    etiqueta: 'nav.gastoInteligente',
    detalle: 'nav.gastoInteligenteDetalle',
    Icono: Lightbulb,
  },
  {
    href: '/dashboard/consolidated',
    etiqueta: 'nav.consolidado',
    detalle: 'nav.consolidadoDetalle',
    Icono: PieChart,
  },
  { href: '/dashboard/guide', etiqueta: 'nav.guia', detalle: 'nav.guiaDetalle', Icono: BookOpen },
  {
    href: '/dashboard/settings',
    etiqueta: 'nav.ajustes',
    detalle: 'nav.ajustesDetalle',
    Icono: Settings,
  },
]

/**
 * Bandeja inferior con el resto de las secciones.
 *
 * POR QUÉ UNA BANDEJA Y NO MÁS PESTAÑAS
 *
 * La app tiene once secciones y el pulgar alcanza cómodo cinco. Meter once en
 * la barra las dejaba de 32 px de ancho, sin etiqueta legible y con los
 * objetivos táctiles por debajo del mínimo. Las cuatro que quedan en la barra
 * son las de uso diario; el resto entra acá, donde cada una puede tener nombre
 * y una línea que explique para qué sirve.
 *
 * Porteada a `document.body`: la barra inferior tiene `backdrop-blur`, que en
 * WebKit recorta a sus descendientes `fixed`. Es el mismo motivo documentado
 * en `components/layout/floating-panel.tsx`.
 */
export function MoreMenuDrawer({ onCerrar }: { onCerrar: () => void }) {
  const ruta = usePathname()
  const { t } = useTraduccion()

  useEffect(() => {
    function alEscapar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alEscapar)
    return () => document.removeEventListener('keydown', alEscapar)
  }, [onCerrar])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('nav.masSecciones')}
      className="fixed inset-0 z-[75] flex items-end justify-center"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-midnight-navy/70 backdrop-blur-sm"
      />

      <div className="glass-card relative z-10 flex max-h-[85dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl bg-menu px-4 pt-3 respiro-hoja">
        {/* Manija: la señal universal de "esto se arrastra o se cierra". */}
        <div className="mx-auto h-1 w-10 shrink-0 rounded-full bg-glass-stroke" aria-hidden />

        <div className="flex items-center justify-between gap-3">
          <h2 className="aurem-caps text-[11px] text-gold-leaf">{t('nav.masSecciones')}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid size-7 cursor-pointer place-items-center rounded-md text-subtle transition hover:bg-foreground/5"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <ul className="flex flex-col">
          {SECCIONES.map(({ href, etiqueta, detalle, Icono }) => {
            const activa = ruta.startsWith(href)

            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onCerrar}
                  aria-current={activa ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-xl px-2 py-2.5 transition active:scale-[0.98] ${
                    activa ? 'bg-gold-leaf/10' : 'hover:bg-gold-leaf/[0.07]'
                  }`}
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl border ${
                      activa
                        ? 'border-gold-leaf/60 bg-gold-leaf/10 text-gold-leaf'
                        : 'border-glass-stroke/50 text-on-surface-variant'
                    }`}
                  >
                    <Icono className="size-4" aria-hidden />
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={`truncate text-sm font-medium ${
                        activa ? 'text-gold-leaf' : 'text-on-background'
                      }`}
                    >
                      {t(etiqueta)}
                    </span>
                    <span className="truncate text-[11px] text-subtle">{t(detalle)}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </div>,
    document.body
  )
}
