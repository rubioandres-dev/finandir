import { CreditCard, Lightbulb } from 'lucide-react'
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
      <Card className="flex items-center gap-3 border-dashed p-3.5">
        <CreditCard className="size-4 shrink-0 text-subtle" aria-hidden />
        <p className="text-xs text-subtle">
          Cargá tus tarjetas de crédito y te digo con cuál conviene comprar cada día.
        </p>
      </Card>
    )
  }

  const { tarjeta, motivo, diasDeFinanciacion, fechaDeVencimiento } = recomendacion
  const ultimos = tarjeta.detalle.last_four_digits

  return (
    <Card className="border-wealth/25 bg-wealth/[0.06] p-3.5">
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-wealth" aria-hidden />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm leading-snug">
            Hoy te conviene comprar con{' '}
            <strong className="font-semibold tracking-tight">{tarjeta.name}</strong>
            {ultimos && <span className="text-subtle"> ····{ultimos}</span>}
          </p>
          <p className="text-xs text-muted">
            {motivo} · pagás en{' '}
            <strong className="font-semibold tabular-nums text-wealth">
              {diasDeFinanciacion} días
            </strong>{' '}
            <span className="text-subtle">({fechaDeVencimiento})</span>
          </p>
        </div>
      </div>
    </Card>
  )
}
