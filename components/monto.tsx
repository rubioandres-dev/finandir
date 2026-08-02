'use client'

import { useMoneda } from '@/components/currency-provider'
import { formatearMonto, type MontoBimoneda } from '@/lib/types'

type Props = MontoBimoneda & {
  className?: string
  /** Prefijo de signo, ej. '+' o '−'. No se muestra si el monto es null. */
  signo?: string
}

/**
 * Muestra un importe en la moneda que el usuario eligió en el toggle.
 *
 * El servidor manda los dos valores ya calculados, así cambiar de moneda es
 * instantáneo: no hay round-trip ni recálculo.
 */
export function Monto({ ars, usd, className, signo }: Props) {
  const { moneda } = useMoneda()
  const valor = moneda === 'ARS' ? ars : usd

  if (valor === null) {
    return (
      <span className={className} title="No hay cotización para convertir este importe">
        —
      </span>
    )
  }

  return (
    <span className={className}>
      {signo}
      {formatearMonto(valor, moneda)}
    </span>
  )
}
