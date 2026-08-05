import type { TramoDeDistribucion } from '@/lib/investments-service'
import { ETIQUETA_TIPO_ACTIVO, formatearMonto, type Moneda, type TipoDeActivo } from '@/lib/types'

/**
 * Un color por tipo de activo, todos tomados de tokens del tema y no de hex
 * sueltos: así el reparto sigue al modo claro sin una segunda paleta. Son tres
 * oros/ámbar más esmeralda y arena, que se distinguen entre sí y no se salen
 * del sistema AUREM.
 */
const COLOR: Record<TipoDeActivo, string> = {
  MONEY_MARKET: 'var(--gold-leaf)',
  FIXED_INCOME: 'var(--primary-container)',
  STOCKS_CEDEARS: 'var(--success-emerald)',
  CRYPTO: 'var(--budget-warn)',
  REAL_ESTATE: 'var(--on-surface-variant)',
}

/** Barra apilada del reparto por tipo, con su leyenda. Una por moneda. */
export function InvestmentDistribution({
  tramos,
  moneda,
}: {
  tramos: TramoDeDistribucion[]
  moneda: Moneda
}) {
  if (tramos.length === 0) return null

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-foreground/10"
        role="img"
        aria-label={`Reparto de la cartera en ${moneda}: ${tramos
          .map((t) => `${ETIQUETA_TIPO_ACTIVO[t.tipo]} ${t.porcentaje}%`)
          .join(', ')}`}
      >
        {tramos.map((tramo) => (
          <div
            key={tramo.tipo}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${tramo.porcentaje}%`, background: COLOR[tramo.tipo] }}
          />
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {tramos.map((tramo) => (
          <li key={tramo.tipo} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: COLOR[tramo.tipo] }}
            />
            <span className="text-[11px] text-on-surface-variant">
              {ETIQUETA_TIPO_ACTIVO[tramo.tipo]}
            </span>
            <span className="text-[11px] font-semibold tabular-nums text-on-background">
              {tramo.porcentaje}%
            </span>
            <span className="text-[10px] tabular-nums text-subtle">
              {formatearMonto(tramo.valor, moneda)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
