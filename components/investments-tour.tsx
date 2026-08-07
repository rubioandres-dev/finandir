'use client'

import { HelpCircle } from 'lucide-react'
import { useTraduccion } from '@/components/currency-provider'
import { useTour } from '@/components/guided-tour'

/**
 * Botón "?" del módulo de Inversiones.
 *
 * Dispara el recorrido `inversiones` del `GuidedTourProvider` que ya vive en el
 * layout. No hay un segundo componente de spotlight: el recorte, la tarjeta, el
 * manejo de teclado y el "ya lo vi" son los mismos, y sólo cambian los tres
 * pasos. Duplicarlos habría sido garantizar que las dos versiones se separen al
 * primer retoque de estilo.
 */
export function InvestmentsTourButton() {
  const { t } = useTraduccion()
  const { abrirTour } = useTour()

  return (
    <button
      type="button"
      onClick={() => abrirTour('inversiones')}
      aria-label={t('tour.invTitulo')}
      title={t('tour.invTitulo')}
      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-xl border border-gold-leaf/60 text-gold-leaf transition active:scale-90 hover:bg-gold-leaf/10"
    >
      <HelpCircle className="size-4" aria-hidden />
    </button>
  )
}
