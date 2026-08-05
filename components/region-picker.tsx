'use client'

import { Check } from 'lucide-react'
import { CATALOGO_LOCALES, type Locale } from '@/lib/formatters'

/**
 * Elección de la región que define el formato de números y fechas.
 *
 * Cada opción muestra un EJEMPLO en vez de solo el nombre del país. Es lo que
 * vuelve entendible la elección: "es-AR" no le dice nada a nadie, pero
 * "$ 1.234,56 · 10/09/2026" al lado de "$1,234.56 · 09/10/2026" muestra de una
 * que la misma fecha se lee distinto.
 */
export function RegionPicker({
  seleccionada,
  onCambiar,
  deshabilitado = false,
}: {
  seleccionada: Locale
  onCambiar: (locale: Locale) => void
  deshabilitado?: boolean
}) {
  return (
    <ul className="flex flex-col gap-2">
      {CATALOGO_LOCALES.map(({ codigo, pais, bandera, ejemplo }) => {
        const elegida = codigo === seleccionada

        return (
          <li key={codigo}>
            <button
              type="button"
              onClick={() => onCambiar(codigo)}
              disabled={deshabilitado}
              aria-pressed={elegida}
              className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 ${
                elegida
                  ? 'border-gold-leaf bg-gold-leaf/10'
                  : 'border-glass-stroke/50 hover:border-gold-leaf/60'
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {bandera}
              </span>

              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={`text-sm font-medium ${elegida ? 'text-gold-leaf' : 'text-on-background'}`}
                >
                  {pais}
                </span>
                <span className="truncate text-[11px] tabular-nums text-subtle">{ejemplo}</span>
              </span>

              {elegida && <Check className="size-4 shrink-0 text-gold-leaf" aria-hidden />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
