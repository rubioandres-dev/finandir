'use client'

import { useEquivalencias, useFormatoRegional } from '@/components/currency-provider'
import { type Moneda } from '@/lib/types'

type Props = {
  valor: number
  moneda: Moneda
  className?: string
  /** Prefijo de signo, ej. '+' o '−'. */
  signo?: string
  /**
   * Equivalente aproximado en la otra moneda. Solo se muestra si el usuario
   * activó las equivalencias, y siempre marcado con ≈: es una referencia,
   * no un dato contable.
   */
  equivalente?: { valor: number; moneda: Moneda } | null
}

/**
 * Muestra un importe SIEMPRE en su moneda original.
 *
 * ARS y USD son libros separados: convertir para mostrar mezclaría dos
 * unidades que no se suman entre sí.
 */
export function Monto({ valor, moneda, className, signo, equivalente }: Props) {
  const { mostrarEquivalencias } = useEquivalencias()
  const { formatearMonto } = useFormatoRegional()

  return (
    <span className={className}>
      {signo}
      {formatearMonto(valor, moneda)}
      {mostrarEquivalencias && equivalente && (
        <span className="ml-1.5 text-[0.75em] font-normal text-subtle" title="Conversión aproximada">
          ≈ {formatearMonto(equivalente.valor, equivalente.moneda)}
        </span>
      )}
    </span>
  )
}

/**
 * Métrica con una línea por moneda. Es la forma normal de mostrar totales:
 * nunca se suma un total en pesos con uno en dólares.
 */
export function MontoPorMoneda({
  totales,
  className,
  signo,
  vacio = '—',
  apilado = false,
}: {
  totales: { moneda: Moneda; valor: number }[]
  className?: string
  signo?: string
  vacio?: string
  /**
   * Pone el código de moneda ARRIBA del importe en vez de a su izquierda.
   *
   * En línea, el código ocupa un carril fijo de 2rem y el importe se queda con
   * el resto: en una card a media pantalla, "$ 1.500.000,00" no entra y el
   * navegador lo parte por donde puede — típicamente dejando la coma decimal
   * colgando sola en la segunda línea. Apilado, el importe dispone del ancho
   * completo de la card.
   */
  apilado?: boolean
}) {
  const { formatearMonto } = useFormatoRegional()
  const conMovimiento = totales.filter((t) => t.valor !== 0)

  if (conMovimiento.length === 0) {
    return <span className={className}>{vacio}</span>
  }

  if (apilado) {
    return (
      <span className="flex min-w-0 flex-col gap-1.5">
        {conMovimiento.map((total) => (
          <span key={total.moneda} className="flex min-w-0 flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
              {total.moneda}
            </span>
            {/* `break-all` y no `break-words`: un importe es una sola palabra
                larga, así que solo un corte por carácter lo puede acomodar. */}
            <span className={`min-w-0 break-all ${className ?? ''}`}>
              {signo}
              {formatearMonto(total.valor, total.moneda)}
            </span>
          </span>
        ))}
      </span>
    )
  }

  return (
    <span className="flex flex-col gap-0.5">
      {conMovimiento.map((total) => (
        <span key={total.moneda} className="flex items-baseline gap-1.5">
          <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-subtle">
            {total.moneda}
          </span>
          <span className={className}>
            {signo}
            {formatearMonto(total.valor, total.moneda)}
          </span>
        </span>
      ))}
    </span>
  )
}
