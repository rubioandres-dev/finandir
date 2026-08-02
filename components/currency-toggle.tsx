'use client'

import { useMoneda, type Moneda } from '@/components/currency-provider'

const OPCIONES: Moneda[] = ['ARS', 'USD']

export function CurrencyToggle({ cotizacion }: { cotizacion: number | null }) {
  const { moneda, cambiar } = useMoneda()

  return (
    <div className="flex items-center gap-2">
      {cotizacion !== null && (
        <span
          className="hidden text-[11px] tabular-nums text-black/40 sm:inline dark:text-white/40"
          title="Dólar MEP usado para convertir"
        >
          MEP {cotizacion.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </span>
      )}

      <div
        role="group"
        aria-label="Moneda de visualización"
        className="flex rounded-lg border border-black/10 p-0.5 dark:border-white/12"
      >
        {OPCIONES.map((opcion) => (
          <button
            key={opcion}
            type="button"
            onClick={() => cambiar(opcion)}
            aria-pressed={moneda === opcion}
            className={`rounded-md px-2 py-1 text-xs font-medium tabular-nums transition ${
              moneda === opcion
                ? 'bg-emerald-600 text-white'
                : 'text-black/55 hover:text-black dark:text-white/55 dark:hover:text-white'
            }`}
          >
            {opcion}
          </button>
        ))}
      </div>
    </div>
  )
}
