'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Globe, Loader2 } from 'lucide-react'
import { useTraduccion } from '@/components/currency-provider'
import { useCierreConAtras } from '@/lib/use-cierre-con-atras'

/**
 * Confirmación antes de cambiar idioma o región.
 *
 * POR QUÉ ESTE CAMBIO SÍ PIDE CONFIRMACIÓN Y LAS DIVISAS NO
 *
 * Sacar una divisa se deshace tocando el mismo chip. Cambiar el idioma
 * reescribe toda la interfaz, incluido el botón que necesitás para volver: si
 * alguien toca "English" sin querer, el camino de vuelta está en un idioma que
 * quizá no lee. Un paso de confirmación cuesta un toque y evita eso.
 *
 * El texto del cuerpo se muestra en el idioma ACTUAL, no en el nuevo: es lo
 * que el usuario todavía entiende al momento de decidir.
 */
export function LocationConfirmModal({
  destino,
  guardando,
  onConfirmar,
  onCancelar,
}: {
  /** Nombre legible de lo que se está por activar, ya traducido. */
  destino: string
  guardando: boolean
  onConfirmar: () => void
  onCancelar: () => void
}) {
  // Atrás cancela, salvo con el guardado en vuelo (igual que Escape).
  useCierreConAtras(!guardando, onCancelar)

  const { t } = useTraduccion()

  useEffect(() => {
    function alEscapar(evento: KeyboardEvent) {
      if (evento.key === 'Escape' && !guardando) onCancelar()
    }
    document.addEventListener('keydown', alEscapar)
    return () => document.removeEventListener('keydown', alEscapar)
  }, [onCancelar, guardando])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="localizacion-titulo"
      className="fixed inset-0 z-[88] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label={t('localizacion.cancelar')}
        onClick={onCancelar}
        disabled={guardando}
        className="absolute inset-0 bg-midnight-navy/70 backdrop-blur-sm"
      />

      <div className="glass-card relative z-10 flex w-full max-w-sm flex-col gap-4 rounded-t-3xl bg-menu px-5 pt-5 respiro-hoja sm:rounded-3xl">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold-leaf/10 text-gold-leaf">
            <Globe className="size-4" aria-hidden />
          </span>
          <h3
            id="localizacion-titulo"
            className="font-display text-sm font-bold tracking-tight text-on-background"
          >
            {t('localizacion.titulo')}
          </h3>
        </div>

        <p className="text-xs leading-relaxed text-on-surface-variant">
          {t('localizacion.cuerpo', { destino })}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onConfirmar}
            disabled={guardando}
            className="fire-gradient glow-gold flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60"
          >
            {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {guardando ? t('ajustes.guardando') : t('localizacion.confirmar')}
          </button>

          <button
            type="button"
            onClick={onCancelar}
            disabled={guardando}
            className="cursor-pointer rounded-lg border border-glass-stroke/50 px-3 py-2.5 text-sm font-medium text-on-surface-variant transition active:scale-95 hover:border-gold-leaf/60 disabled:opacity-60"
          >
            {t('localizacion.cancelar')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
