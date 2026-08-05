'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { formatearActualizacion, formatearCompra, formatoPesos } from '@/lib/rates-format'
import type { CotizacionDeMercado } from '@/lib/rates'

/**
 * Panel completo de cotizaciones.
 *
 * POR QUÉ VA PORTALEADO Y NO ADENTRO DE LA CARD
 *
 * Lo abre `MarketRatesCard`, que es una `.glass-card`: tiene `backdrop-filter`
 * y `overflow: hidden`. Un `fixed` adentro de ese subárbol queda recortado al
 * borde de la card en WebKit —o sea, en iOS, que es el navegador real de esta
 * PWA—, además de heredar su stacking context. Es exactamente la falla que ya
 * documenta `components/layout/floating-panel.tsx`, y la salida es la misma:
 * portalear a `document.body`, donde no hay ningún ancestro con filtro.
 *
 * El padre lo monta SOLO cuando está abierto, así nada de esto corre en el
 * render del servidor.
 */
export function QuotesModal({
  cotizaciones,
  fechaMep,
  onCerrar,
}: {
  cotizaciones: CotizacionDeMercado[]
  /** Fecha de la cotización MEP guardada, la que usa la app para convertir. */
  fechaMep: string | null
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

  // Sin esto, Escape depende de dónde haya quedado el foco y un lector de
  // pantalla no se entera de que apareció algo.
  useEffect(() => {
    hoja.current?.focus({ preventScroll: true })
  }, [])

  const ultima = cotizaciones
    .map((c) => formatearActualizacion(c.actualizado))
    .find((texto): texto is string => texto !== null)

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cotizaciones del mercado"
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-midnight-navy/70 backdrop-blur-sm"
      />

      <div
        ref={hoja}
        tabIndex={-1}
        className="glass-card safe-bottom relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-menu p-5 outline-none sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="aurem-caps text-[11px] text-gold-leaf">Cotizaciones del mercado</h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid size-7 cursor-pointer place-items-center rounded-md text-subtle hover:bg-foreground/5"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {cotizaciones.length === 0 ? (
          <p className="text-xs text-subtle">
            No se pudieron obtener las cotizaciones. Se reintenta en el próximo refresco.
          </p>
        ) : (
          <>
            {/* Encabezado de columnas: sin esto los dos números de cada fila no
                se distinguen entre sí. */}
            <div className="flex items-baseline gap-3 border-b border-glass-stroke/40 pb-1.5">
              <span className="flex-1" />
              <span className="aurem-caps w-24 text-right text-[9px] text-on-surface-variant/70">
                Compra
              </span>
              <span className="aurem-caps w-24 text-right text-[9px] text-on-surface-variant/70">
                Venta
              </span>
            </div>

            <ul className="flex flex-col divide-y divide-glass-stroke/25">
              {cotizaciones.map((cotizacion) => {
                const compra = formatearCompra(cotizacion.compra)

                return (
                  <li key={cotizacion.clave} className="flex items-baseline gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-on-surface-variant">
                      {cotizacion.nombre}
                    </span>
                    <span className="w-24 text-right text-sm tabular-nums text-on-surface-variant">
                      {compra ?? <span className="text-subtle">—</span>}
                    </span>
                    <span className="w-24 text-right text-sm font-semibold tabular-nums text-on-background">
                      {formatoPesos.format(cotizacion.venta)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        <div className="flex flex-col gap-0.5 border-t border-glass-stroke/40 pt-2">
          {ultima && (
            <p className="text-[10px] tabular-nums text-on-surface-variant/80">
              Actualizado {ultima} hs
            </p>
          )}
          <p className="text-[10px] leading-snug text-subtle">
            Fuente: DolarApi / Cotización MEP Supabase
            {fechaMep && ` · MEP de conversión del ${fechaMep}`}
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
