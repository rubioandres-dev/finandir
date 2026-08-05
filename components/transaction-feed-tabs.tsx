'use client'

import { useTraduccion } from '@/components/currency-provider'
import type { Clave } from '@/lib/i18n'

import { useState } from 'react'

type Pestania = 'mes' | 'futuras' | 'anteriores'

const ORDEN: { clave: Pestania; etiqueta: Clave }[] = [
  { clave: 'mes', etiqueta: 'mov.mesActual' },
  { clave: 'futuras', etiqueta: 'mov.cuotasFuturas' },
  { clave: 'anteriores', etiqueta: 'mov.anteriores' },
]

/**
 * Pestañas del historial.
 *
 * Las tres listas llegan YA RENDERIZADAS desde el servidor, como props de tipo
 * ReactNode. Es lo que hace que cambiar de pestaña sea instantáneo: no hay
 * fetch, ni navegación, ni un segundo render. El costo es que el HTML inicial
 * trae las tres; a cambio, el componente de cliente no necesita saber nada de
 * movimientos, monedas ni categorías.
 *
 * Arranca en "mes" a propósito: las cuotas de meses que todavía no llegaron no
 * tienen por qué competir con el gasto de ayer.
 */
export function TransactionFeedTabs({
  mes,
  futuras,
  anteriores,
  contadores,
}: {
  mes: React.ReactNode
  futuras: React.ReactNode
  anteriores: React.ReactNode
  contadores: Record<Pestania, number>
}) {
  const { t } = useTraduccion()
  const [activa, setActiva] = useState<Pestania>('mes')

  const contenido = { mes, futuras, anteriores }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label={t('mov.periodo')}
        className="flex gap-1 rounded-xl border border-glass-stroke/50 p-0.5"
      >
        {ORDEN.map(({ clave, etiqueta }) => {
          const seleccionada = activa === clave

          return (
            <button
              key={clave}
              type="button"
              role="tab"
              aria-selected={seleccionada}
              onClick={() => setActiva(clave)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${
                seleccionada
                  ? 'fire-gradient text-midnight-navy'
                  : 'text-on-surface-variant hover:text-gold-leaf'
              }`}
            >
              <span className="truncate">{t(etiqueta)}</span>
              {contadores[clave] > 0 && (
                <span
                  className={`shrink-0 tabular-nums ${
                    seleccionada ? 'opacity-70' : 'text-subtle'
                  }`}
                >
                  {contadores[clave]}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div role="tabpanel">{contenido[activa]}</div>
    </div>
  )
}
