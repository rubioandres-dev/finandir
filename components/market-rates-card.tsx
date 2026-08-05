import { TrendingUp } from 'lucide-react'
import { Card, CardLabel } from '@/components/ui/card'
import type { CotizacionDeMercado } from '@/lib/rates'

const formatoPesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

/** "2026-08-05T14:32:00Z" -> "5/8 14:32". Vacío si la API no la informó. */
function formatearActualizacion(iso: string | null): string | null {
  if (!iso) return null
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return null

  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(fecha)
}

/**
 * Panel de cotizaciones de referencia.
 *
 * El MEP que muestra acá y el que la app usa para convertir salen de la misma
 * fuente, pero por caminos distintos: el de convertir se persiste en
 * `exchange_rates` para congelar el histórico. Por eso la leyenda nombra a las
 * dos.
 */
export function MarketRatesCard({
  cotizaciones,
  fechaMep,
}: {
  cotizaciones: CotizacionDeMercado[]
  /** Fecha de la cotización MEP guardada, la que usa la app para convertir. */
  fechaMep: string | null
}) {
  if (cotizaciones.length === 0) {
    return (
      <Card className="flex flex-col justify-center gap-2 border-dashed p-4">
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

  const ultima = cotizaciones
    .map((c) => formatearActualizacion(c.actualizado))
    .find((texto): texto is string => texto !== null)

  return (
    <Card glass className="flex flex-col gap-3 p-4">
      <CardLabel>
        <TrendingUp className="size-3.5 text-gold-leaf" aria-hidden />
        Cotizaciones del mercado
      </CardLabel>

      <ul className="flex flex-col divide-y divide-glass-stroke/25">
        {cotizaciones.map((cotizacion) => (
          <li key={cotizacion.clave} className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="min-w-0 truncate text-[11px] text-on-surface-variant">
              {cotizacion.nombre}
            </span>
            <span className="shrink-0 text-right">
              <span className="text-sm font-semibold tabular-nums text-on-background">
                {formatoPesos.format(cotizacion.venta)}
              </span>
              {cotizacion.compra !== null && cotizacion.compra > 0 && (
                <span className="ml-1.5 text-[10px] tabular-nums text-subtle">
                  compra {formatoPesos.format(cotizacion.compra)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

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
    </Card>
  )
}
