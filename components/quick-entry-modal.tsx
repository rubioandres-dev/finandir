'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X } from 'lucide-react'
import { SmartInput } from '@/components/smart-input'
import type { CuentaElegible } from '@/lib/types'

/**
 * Carga rápida de un movimiento, sin salir de donde estabas.
 *
 * POR QUÉ UN MODAL Y NO UN SALTO AL DASHBOARD
 *
 * La primera versión del botón flotante navegaba a `/dashboard#smart-input`.
 * Funcionaba, pero te sacaba de la pantalla en la que estabas —y si estabas
 * mirando el calendario o una tarjeta, volver era cosa tuya. El costo de
 * cargar un gasto no puede ser perder el contexto.
 *
 * Adentro va el MISMO `<SmartInput>` que el dashboard, no una copia: el
 * parseo por IA, el dictado, el plan de cuotas y el guardado son idénticos, y
 * mantener dos implementaciones de eso garantizaba que se desfasaran. Lo único
 * que cambia es el envoltorio y que acá el campo arranca enfocado.
 *
 * NO se cierra solo al guardar. `<SmartInput>` muestra "Movimiento guardado."
 * y deja el campo limpio: si el modal se desvaneciera, esa sería la única
 * confirmación que el usuario nunca llega a ver cuando está parado en una
 * pantalla que no lista movimientos. Además deja cargar dos seguidos, que es
 * el caso típico de quien descarga los gastos del día.
 */
export function QuickEntryModal({
  categorias,
  cuentas,
  onCerrar,
}: {
  categorias: { nombre: string; tipo: 'INCOME' | 'EXPENSE' }[]
  cuentas: CuentaElegible[]
  onCerrar: () => void
}) {
  const hoja = useRef<HTMLDivElement>(null)

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
      aria-labelledby="carga-rapida-titulo"
      className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-midnight-navy/70 backdrop-blur-sm"
      />

      <div
        ref={hoja}
        className="glass-card safe-bottom relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-3xl bg-menu p-5 sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h3
            id="carga-rapida-titulo"
            className="aurem-caps flex items-center gap-1.5 text-[11px] text-gold-leaf"
          >
            <Sparkles className="size-3.5" aria-hidden />
            Nuevo movimiento
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid size-7 cursor-pointer place-items-center rounded-md text-subtle transition hover:bg-foreground/5"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* `ancla={null}`: el del dashboard ya usa el id `smart-input`, y dos
            elementos con el mismo id en el documento rompen el scroll al ancla
            y confunden a los lectores de pantalla. */}
        <SmartInput categorias={categorias} cuentas={cuentas} ancla={null} autoFoco />
      </div>
    </div>,
    document.body
  )
}
