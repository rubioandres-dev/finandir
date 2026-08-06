'use client'

import Link from 'next/link'
import {
  CalendarDays,
  HandCoins,
  Lightbulb,
  Scale,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useModuloActivo, useTraduccion } from '@/components/currency-provider'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import type { Clave } from '@/lib/i18n'
import type { Modulo } from '@/lib/modules'

/**
 * Atajos de la columna derecha del escritorio.
 *
 * POR QUÉ EXISTE SI YA ESTÁ LA NAVEGACIÓN
 *
 * En mobile la barra inferior y la bandeja "Más" cubren todo. En escritorio la
 * navegación del header entra en una línea y las secciones que no entraron
 * —gasto inteligente, consolidado, compartidos— quedaban sin puerta visible: se
 * llegaba a ellas escribiendo la URL. Esta card ocupa el espacio que sobra en
 * pantallas anchas con lo que la barra no muestra.
 *
 * RESPETA LOS MÓDULOS. Un atajo a una sección apagada sería una puerta a algo
 * que el usuario decidió no ver.
 */
const ATAJOS: {
  href: string
  etiqueta: Clave
  Icono: typeof Target
  /** `undefined` = siempre visible. */
  modulo?: Modulo
}[] = [
  { href: '/dashboard/smart-spend', etiqueta: 'nav.gastoInteligente', Icono: Lightbulb, modulo: 'smart_spend' },
  { href: '/dashboard/investments', etiqueta: 'nav.inversiones', Icono: TrendingUp, modulo: 'investments' },
  { href: '/dashboard/goals', etiqueta: 'nav.objetivos', Icono: Target, modulo: 'goals' },
  { href: '/dashboard/debts', etiqueta: 'nav.deudas', Icono: HandCoins, modulo: 'debts' },
  { href: '/dashboard/calendar', etiqueta: 'nav.calendario', Icono: CalendarDays, modulo: 'calendar' },
  { href: '/dashboard/shared-expenses', etiqueta: 'nav.compartidos', Icono: Users, modulo: 'shared_expenses' },
  { href: '/dashboard/consolidated', etiqueta: 'nav.consolidado', Icono: Scale },
]

export function QuickAccess() {
  const { t } = useTraduccion()
  const moduloActivo = useModuloActivo()

  const visibles = ATAJOS.filter((atajo) => !atajo.modulo || moduloActivo(atajo.modulo))

  if (visibles.length === 0) return null

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <CardLabel>{t('accesos.titulo')}</CardLabel>

        <ul className="grid grid-cols-2 gap-2">
          {visibles.map(({ href, etiqueta, Icono }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex h-full items-center gap-2 rounded-xl border border-glass-stroke/50 px-2.5 py-2 text-[11px] font-medium text-on-surface-variant transition active:scale-95 hover:border-gold-leaf/60 hover:text-gold-leaf"
              >
                <Icono className="size-3.5 shrink-0 text-gold-leaf" aria-hidden />
                <span className="min-w-0 truncate">{t(etiqueta)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
