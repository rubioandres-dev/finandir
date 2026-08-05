'use client'

import { useState } from 'react'
import { ArrowRight, TrendingUp } from 'lucide-react'
import { Card, CardLabel } from '@/components/ui/card'
import { QuotesModal } from '@/components/quotes-modal'
import { formatearActualizacion, formatearCompra, formatoPesos } from '@/lib/rates-format'
import type { CotizacionDeMercado } from '@/lib/rates'

/**
 * Las dos que se muestran sin abrir nada, en este orden.
 *
 * El resto del panel (MEP, Blue, CCL, Tarjeta) no desapareció: vive en el
 * modal. Son datos de referencia, y seis filas de referencia en el dashboard
 * pesaban más de lo que informaban.
 */
const VISTA_PREVIA: CotizacionDeMercado['clave'][] = ['oficial', 'eur']

/**
 * Panel de cotizaciones de referencia.
 *
 * El MEP que muestra el modal y el que la app usa para convertir salen de la
 * misma fuente, pero por caminos distintos: el de convertir se persiste en
 * `exchange_rates` para congelar el histórico. Por eso la leyenda del modal
 * nombra a las dos.
 */
export function MarketRatesCard({
  cotizaciones,
  fechaMep,
}: {
  cotizaciones: CotizacionDeMercado[]
  /** Fecha de la cotización MEP guardada, la que usa la app para convertir. */
  fechaMep: string | null
}) {
  const [modalAbierto, setModalAbierto] = useState(false)

  if (cotizaciones.length === 0) {
    return (
      <Card className="flex h-full flex-col justify-center gap-2 border-dashed p-4">
        <CardLabel>
          <TrendingUp className="size-3.5 text-gold-leaf" aria-hidden />
          Cotizaciones del mercado
        </CardLabel>
        <p className="text-xs text-subtle">
          No se pudieron obtener las cotizaciones. Se reintenta en el próximo refresco.
        </p>
      </Card>
    )
  }

  // El orden lo manda VISTA_PREVIA, no el que traiga la API.
  const destacadas = VISTA_PREVIA.map((clave) =>
    cotizaciones.find((cotizacion) => cotizacion.clave === clave)
  ).filter((cotizacion): cotizacion is CotizacionDeMercado => cotizacion !== undefined)

  const ultima = cotizaciones
    .map((c) => formatearActualizacion(c.actualizado))
    .find((texto): texto is string => texto !== null)

  return (
    <>
      <Card
        glass
        className="flex h-full flex-col justify-between gap-3 p-4 transition-colors hover:border-gold-leaf/50"
      >
        <div className="flex flex-col gap-3">
          <CardLabel>
            <TrendingUp className="size-3.5 text-gold-leaf" aria-hidden />
            Cotizaciones del mercado
          </CardLabel>

          <ul className="flex flex-col divide-y divide-glass-stroke/25">
            {destacadas.map((cotizacion) => {
              const compra = formatearCompra(cotizacion.compra)

              return (
                <li
                  key={cotizacion.clave}
                  className="flex items-baseline justify-between gap-3 py-1.5"
                >
                  <span className="min-w-0 truncate text-[11px] text-on-surface-variant">
                    {cotizacion.nombre}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="text-sm font-semibold tabular-nums text-on-background">
                      {formatoPesos.format(cotizacion.venta)}
                    </span>
                    {compra && (
                      <span className="ml-1.5 text-[10px] tabular-nums text-subtle">
                        compra {compra}
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-1.5">
          {ultima && (
            <p className="text-[10px] tabular-nums text-on-surface-variant/80">
              Actualizado {ultima} hs
            </p>
          )}

          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="flex w-full cursor-pointer items-center justify-between gap-2 border-t border-glass-stroke pt-2 text-left text-xs text-gold-leaf hover:underline"
          >
            <span>Ver todas las cotizaciones (MEP, Blue, CCL...)</span>
            <ArrowRight className="size-3.5 shrink-0" aria-hidden />
          </button>
        </div>
      </Card>

      {modalAbierto && (
        <QuotesModal
          cotizaciones={cotizaciones}
          fechaMep={fechaMep}
          onCerrar={() => setModalAbierto(false)}
        />
      )}
    </>
  )
}
