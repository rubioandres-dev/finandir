'use client'

import { useEquivalencias } from '@/components/currency-provider'

const OPCIONES = ['ARS', 'USD'] as const

/**
 * Selector de moneda de referencia del header.
 *
 * ARS y USD siguen siendo libros separados: esto no convierte nada ni cambia
 * la moneda de los datos. Elegir USD enciende las equivalencias aproximadas
 * (≈) que acompañan a cada importe; ARS las apaga.
 */
export function CurrencySelector({ cotizacion }: { cotizacion: number | null }) {
  const { mostrarEquivalencias, alternar } = useEquivalencias()

  if (cotizacion === null) return null

  const mep = cotizacion.toLocaleString('es-AR', { maximumFractionDigits: 0 })
  const activa = mostrarEquivalencias ? 'USD' : 'ARS'

  return (
    <div
      role="group"
      aria-label={`Moneda de referencia · dólar MEP ${mep}`}
      title={`Mostrar equivalencias en dólares · MEP ${mep}`}
      className="flex rounded-xl border border-glass-stroke/60 bg-surface-container/60 p-0.5"
    >
      {OPCIONES.map((opcion) => {
        const seleccionada = activa === opcion

        return (
          <button
            key={opcion}
            type="button"
            onClick={() => {
              if (!seleccionada) alternar()
            }}
            aria-pressed={seleccionada}
            className={`rounded-lg px-2 py-1 font-display text-[10px] font-bold uppercase tracking-widest transition active:scale-90 ${
              seleccionada
                ? 'fire-gradient text-midnight-navy'
                : 'text-on-surface-variant hover:text-gold-leaf'
            }`}
          >
            {opcion}
          </button>
        )
      })}
    </div>
  )
}
