'use client'

import { useModoMoneda } from '@/components/currency-provider'
import { MONEDAS } from '@/lib/monedas'

/**
 * Toggle de la moneda activa del header.
 *
 * Ya no enciende y apaga equivalencias: ahora CAMBIA LA MONEDA DE LA APP. Con
 * ARS elegido, las vistas de gestión muestran solo cuentas, movimientos,
 * tarjetas y presupuestos en pesos; con USD, solo los de dólares. Los dos
 * libros siguen sin sumarse nunca: para verlos juntos está la vista
 * consolidada.
 */
export function CurrencySelector({ cotizacion }: { cotizacion: number | null }) {
  const { modo, cambiarModo, cambiando } = useModoMoneda()

  const mep = cotizacion?.toLocaleString('es-AR', { maximumFractionDigits: 0 })

  return (
    <div
      role="group"
      aria-label={cotizacion ? `Moneda activa · dólar MEP ${mep}` : 'Moneda activa'}
      title={cotizacion ? `Moneda activa de la app · MEP ${mep}` : 'Moneda activa de la app'}
      // `aria-busy` mientras el servidor recarga: el cambio no es instantáneo
      // porque cada vista vuelve a consultar filtrada por la moneda nueva.
      aria-busy={cambiando}
      className={`flex shrink-0 rounded-xl border border-glass-stroke/60 bg-surface-container/60 p-0.5 transition-opacity ${
        cambiando ? 'opacity-60' : ''
      }`}
    >
      {MONEDAS.map((opcion) => {
        const activa = modo === opcion

        return (
          <button
            key={opcion}
            type="button"
            onClick={() => cambiarModo(opcion)}
            aria-pressed={activa}
            className={`rounded-lg px-2 py-1 font-display text-[10px] font-bold uppercase tracking-widest transition active:scale-90 ${
              activa
                ? 'fire-gradient text-midnight-navy'
                : 'text-on-surface-variant hover:text-gold-leaf'
            }`}
          >
            {opcion}
          </button>
        )
      })}
    </div>
  )
}
