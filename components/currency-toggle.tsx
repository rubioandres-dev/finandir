'use client'

import { ArrowLeftRight } from 'lucide-react'
import { useEquivalencias } from '@/components/currency-provider'

/**
 * No cambia la moneda de los datos: ARS y USD se muestran siempre por
 * separado. Este control solo enciende las conversiones aproximadas (≈) que
 * acompañan a cada importe.
 */
export function CurrencyToggle({ cotizacion }: { cotizacion: number | null }) {
  const { mostrarEquivalencias, alternar } = useEquivalencias()

  if (cotizacion === null) return null

  const mep = cotizacion.toLocaleString('es-AR', { maximumFractionDigits: 0 })

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={mostrarEquivalencias}
      aria-label={
        mostrarEquivalencias ? 'Ocultar equivalencias' : 'Mostrar equivalencias aproximadas'
      }
      title={`${mostrarEquivalencias ? 'Ocultar' : 'Mostrar'} equivalencias aproximadas · dólar MEP ${mep}`}
      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium tabular-nums transition ${
        mostrarEquivalencias
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border text-muted hover:text-foreground'
      }`}
    >
      <ArrowLeftRight className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">≈ {mep}</span>
    </button>
  )
}
