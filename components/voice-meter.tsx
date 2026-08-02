'use client'

import { AlertTriangle, MicOff } from 'lucide-react'
import { NIVELES, type EstadoVoz, type PermisoMicrofono } from '@/lib/use-voice-input'

type Props = {
  estado: EstadoVoz
  /** Volumen de entrada, de 0 a NIVELES. */
  nivel: number
  sinSenal: boolean
  permiso: PermisoMicrofono
}

const TEXTO: Record<Exclude<EstadoVoz, 'inactivo'>, string> = {
  iniciando: 'Abriendo el micrófono…',
  activo: 'Micrófono activo — hablá',
  sonido: 'Detectando sonido…',
  hablando: 'Te escucho',
}

const COLOR_PUNTO: Record<Exclude<EstadoVoz, 'inactivo'>, string> = {
  iniciando: 'bg-budget-warn',
  activo: 'bg-budget-warn',
  sonido: 'bg-income',
  hablando: 'bg-expense',
}

export function VoiceMeter({ estado, nivel, sinSenal, permiso }: Props) {
  if (permiso === 'denied') {
    return (
      <p
        role="alert"
        className="flex items-center gap-2 rounded-lg border border-expense/30 bg-expense/10 px-3 py-2 text-xs text-expense"
      >
        <MicOff className="size-3.5 shrink-0" aria-hidden />
        El micrófono está bloqueado para este sitio. Habilitalo desde el candado de la barra de
        direcciones y recargá la página.
      </p>
    )
  }

  if (estado === 'inactivo') return null

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2.5">
        <span className="relative flex size-2 shrink-0">
          <span
            className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${COLOR_PUNTO[estado]}`}
          />
          <span className={`relative inline-flex size-2 rounded-full ${COLOR_PUNTO[estado]}`} />
        </span>

        <span className="text-xs font-medium">{TEXTO[estado]}</span>

        {/* Medidor de volumen real: si estas barras no se mueven al hablar,
            el navegador no está recibiendo audio de tu micrófono. */}
        <div
          className="ml-auto flex items-end gap-[3px]"
          role="meter"
          aria-valuenow={nivel}
          aria-valuemin={0}
          aria-valuemax={NIVELES}
          aria-label="Nivel de entrada del micrófono"
        >
          {Array.from({ length: NIVELES }, (_, indice) => {
            const encendida = indice < nivel
            return (
              <span
                key={indice}
                className={`w-[3px] rounded-full transition-all duration-75 ${
                  encendida
                    ? indice >= NIVELES - 2
                      ? 'bg-expense'
                      : 'bg-income'
                    : 'bg-foreground/15'
                }`}
                style={{ height: `${6 + indice * 2.5}px` }}
              />
            )
          })}
        </div>
      </div>

      {sinSenal && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-budget-warn">
          <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden />
          No entra nada de audio. Revisá que no esté silenciado y que el navegador esté usando el
          micrófono correcto.
        </p>
      )}
    </div>
  )
}
