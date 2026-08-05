'use client'

import { Check, Star } from 'lucide-react'
import { CATALOGO_MONEDAS } from '@/lib/monedas'
import type { Moneda } from '@/lib/types'

/**
 * Chips para elegir con qué divisas se trabaja.
 *
 * Lo comparten el onboarding y Ajustes: la elección es la misma cosa en los
 * dos lados, y tenerla duplicada garantizaba que se desfasaran.
 *
 * EL ORDEN ES DATO, NO PRESENTACIÓN
 *
 * La primera divisa elegida es la PRINCIPAL: la que el consolidado usa para
 * expresar el patrimonio total. Por eso al seleccionar se agrega al final y no
 * se reordena por el catálogo, y por eso la primera lleva la estrella.
 */
export function CurrencyPicker({
  seleccionadas,
  onCambiar,
  deshabilitado = false,
}: {
  seleccionadas: Moneda[]
  onCambiar: (monedas: Moneda[]) => void
  deshabilitado?: boolean
}) {
  function alternar(codigo: Moneda) {
    if (seleccionadas.includes(codigo)) {
      // Nunca dejar la lista vacía: sin divisas no hay nada que mostrar en
      // ninguna vista. La base tiene el mismo CHECK.
      if (seleccionadas.length === 1) return
      onCambiar(seleccionadas.filter((m) => m !== codigo))
      return
    }

    onCambiar([...seleccionadas, codigo])
  }

  return (
    <div className="flex flex-col gap-2.5">
      <ul className="flex flex-wrap gap-2">
        {CATALOGO_MONEDAS.map(({ codigo, nombre, simbolo }) => {
          const elegida = seleccionadas.includes(codigo)
          const esPrincipal = seleccionadas[0] === codigo
          const ultima = elegida && seleccionadas.length === 1

          return (
            <li key={codigo}>
              <button
                type="button"
                onClick={() => alternar(codigo)}
                disabled={deshabilitado || ultima}
                aria-pressed={elegida}
                title={
                  ultima
                    ? 'Tenés que trabajar con al menos una divisa.'
                    : esPrincipal
                      ? `${nombre} · divisa principal`
                      : nombre
                }
                className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-left transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 ${
                  elegida
                    ? 'border-gold-leaf bg-gold-leaf/10 text-gold-leaf'
                    : 'border-glass-stroke/50 text-on-surface-variant hover:border-gold-leaf/60 hover:text-gold-leaf'
                }`}
              >
                {esPrincipal ? (
                  <Star className="size-3 shrink-0 fill-current" aria-hidden />
                ) : elegida ? (
                  <Check className="size-3 shrink-0" aria-hidden />
                ) : (
                  <span className="w-3 shrink-0 text-center text-[10px] opacity-60" aria-hidden>
                    {simbolo.slice(0, 2)}
                  </span>
                )}
                <span className="font-display text-[11px] font-bold uppercase tracking-widest">
                  {codigo}
                </span>
                <span className="text-[11px] opacity-80">{nombre}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="text-[11px] leading-snug text-subtle">
        {seleccionadas.length === 1 ? (
          <>
            Trabajás solo en <strong className="text-on-surface-variant">{seleccionadas[0]}</strong>:
            el header no va a mostrar un selector, solo la insignia.
          </>
        ) : (
          <>
            <Star className="mb-0.5 inline size-3 fill-current text-gold-leaf" aria-hidden />{' '}
            <strong className="text-on-surface-variant">{seleccionadas[0]}</strong> es tu divisa
            principal: el consolidado expresa el patrimonio total en ella. Para cambiarla,
            deseleccioná y volvé a elegir en el orden que quieras.
          </>
        )}
      </p>
    </div>
  )
}
