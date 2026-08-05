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
}: {
  totales: { moneda: Moneda; valor: number }[]
  className?: string
  signo?: string
  vacio?: string
}) {
  const { formatearMonto } = useFormatoRegional()
  const conMovimiento = totales.filter((t) => t.valor !== 0)

  if (conMovimiento.length === 0) {
    return <span className={className}>{vacio}</span>
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
