import { CreditCard, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { Recomendacion } from '@/lib/card-optimizer'

/**
 * Widget de portada: con qué tarjeta conviene comprar hoy.
 *
 * La recomendación se calcula en el servidor (lib/card-optimizer) y acá solo
 * se presenta, así el criterio queda testeable aparte de la UI.
 */
export function SmartCardSuggester({
  recomendacion,
  hayTarjetas,
}: {
  recomendacion: Recomendacion | null
  hayTarjetas: boolean
}) {
  if (!recomendacion) {
    if (hayTarjetas) return null

    return (
      <Card className="flex items-center gap-3 border-dashed border-glass-stroke/60 p-3.5">
        <CreditCard className="size-4 shrink-0 text-on-surface-variant/60" aria-hidden />
        <p className="text-xs text-subtle">
          Cargá tus tarjetas de crédito y te digo con cuál conviene comprar cada día.
        </p>
      </Card>
    )
  }

  const { tarjeta, motivo, diasDeFinanciacion, fechaDeVencimiento } = recomendacion
  const ultimos = tarjeta.detalle.last_four_digits

  return (
    <Card glass className="glow-gold overflow-hidden p-0">
      <div className="flex items-stretch">
        {/* Canto dorado a la izquierda: marca la card como recomendación. */}
        <div className="fire-gradient w-1 shrink-0" aria-hidden />

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3 text-gold-leaf" aria-hidden />
            <span className="aurem-caps text-[9px] text-gold-leaf">Tarjeta recomendada</span>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-display text-lg font-bold tracking-tight text-on-background">
                {tarjeta.name}
              </span>
              {ultimos && (
                <span className="font-mono text-[11px] tracking-widest text-on-surface-variant/70">
                  ···· {ultimos}
                </span>
              )}
            </div>

            <div className="shrink-0 text-right">
              <p className="font-display text-2xl font-bold leading-none tabular-nums text-gold-leaf">
                {diasDeFinanciacion}
              </p>
              <p className="aurem-caps text-[8px] text-on-surface-variant/70">días sin pagar</p>
            </div>
          </div>

          <p className="border-t border-glass-stroke/40 pt-2.5 text-[11px] text-on-surface-variant">
            {motivo} · pagás el{' '}
            <strong className="font-semibold text-on-background">{fechaDeVencimiento}</strong>
          </p>
        </div>
      </div>
    </Card>
  )
}
