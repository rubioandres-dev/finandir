import { Lightbulb, Wallet } from 'lucide-react'
import {
  ETIQUETA_TIPO_ACTIVO,
  PLAZOS_LIQUIDOS,
  type Inversion,
  type Moneda,
  type PlazoDeLiquidez,
} from '@/lib/types'

/**
 * Cuándo tenés la plata, en castellano. `ETIQUETA_LIQUIDEZ` dice "Inmediata
 * (T+0)", que en una columna angosta no entra y además vuelve a meter la
 * jerga que esta pantalla justamente saca.
 */
const CUANDO: Record<PlazoDeLiquidez, string> = {
  T0: 'Hoy mismo',
  T1: 'En 24 h',
  T2: 'En 48 h',
  LOCKED: 'Inmovilizada',
}

/**
 * De dónde sale la plata que sostiene el plan de cuotas.
 *
 * El dictamen dice "te conviene financiar porque tu plata rinde". Esto
 * responde la pregunta que sigue: qué plata, exactamente. Con cartera cargada
 * lista los activos que entran en la cuenta; sin cartera explica qué habría
 * que hacer para que el número sea real y no una simulación.
 */
export function InvestmentStrategyBreakdown({
  inversiones,
  moneda,
  tnaAplicada,
}: {
  /** Cartera del usuario, sin filtrar. */
  inversiones: Inversion[]
  /** Moneda de la compra: solo se muestran los activos de esa moneda. */
  moneda: Moneda
  /** La tasa que efectivamente usó el dictamen. */
  tnaAplicada: number
}) {
  // Mismo criterio que `calcularTnaLiquidaPonderada`: T+0 y T+1, con valor.
  // Si acá entrara un activo en cero, la tabla mostraría algo que la tasa no
  // está usando.
  const respaldo = inversiones.filter(
    (inversion) =>
      (inversion.currency?.trim() === 'USD' ? 'USD' : 'ARS') === moneda &&
      PLAZOS_LIQUIDOS.includes(inversion.liquidity_term) &&
      Number(inversion.current_value ?? 0) > 0
  )

  if (respaldo.length === 0) {
    return (
      <div className="flex flex-col gap-2.5 rounded-2xl border border-glass-stroke/50 bg-gold-leaf/[0.05] p-4">
        <p className="flex items-center gap-2 font-display text-sm font-bold tracking-tight text-gold-leaf">
          <Lightbulb className="size-4 shrink-0" aria-hidden />
          ¿Dónde poner tu dinero mientras pagás las cuotas?
        </p>
        <p className="text-xs leading-relaxed text-on-surface-variant">
          Mantené el capital en una <strong className="font-semibold">billetera virtual</strong> o{' '}
          <strong className="font-semibold">fondo T+0</strong> (rescate inmediato) al{' '}
          <strong className="font-semibold tabular-nums text-on-background">
            {tnaAplicada}% TNA
          </strong>
          . Andá retirando solo el valor de la cuota mensual para pagar la tarjeta, mientras el
          resto sigue generando rendimiento.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-tight text-on-background">
        <Wallet className="size-4 shrink-0 text-gold-leaf" aria-hidden />
        Con qué plata lo sostenés
      </p>

      {/* Cuatro columnas en un teléfono quedan justas: si no entran, scrollea
          la tabla y no la página. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[19rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="aurem-caps pb-1.5 text-[8px] text-on-surface-variant/70">
                Inversión
              </th>
              <th scope="col" className="aurem-caps pb-1.5 text-[8px] text-on-surface-variant/70">
                Tipo
              </th>
              <th
                scope="col"
                className="aurem-caps pb-1.5 text-right text-[8px] text-on-surface-variant/70"
              >
                TNA
              </th>
              <th
                scope="col"
                className="aurem-caps pb-1.5 text-right text-[8px] text-on-surface-variant/70"
              >
                Disponible
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {respaldo.map((inversion) => (
              <tr key={inversion.id}>
                <td className="max-w-[8rem] truncate py-1.5 pr-2 text-[11px] font-medium text-on-background">
                  {inversion.name}
                </td>
                <td className="py-1.5 pr-2 text-[11px] text-on-surface-variant">
                  {ETIQUETA_TIPO_ACTIVO[inversion.asset_type]}
                </td>
                <td className="py-1.5 pr-2 text-right text-[11px] font-semibold tabular-nums text-gold-leaf">
                  {Number(inversion.expected_tna)}%
                </td>
                <td className="py-1.5 text-right text-[11px] text-on-surface-variant">
                  {CUANDO[inversion.liquidity_term]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="flex items-baseline justify-between gap-3 border-t border-border pt-2.5">
        <span className="text-[11px] text-on-surface-variant">
          Tasa promedio aplicada
          <span className="ml-1 text-[10px] text-subtle">(ponderada por monto)</span>
        </span>
        <strong className="font-display text-sm font-bold tabular-nums text-gold-leaf">
          {tnaAplicada}% TNA
        </strong>
      </p>
    </div>
  )
}
