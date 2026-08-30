'use client'

import { usePathname } from 'next/navigation'
import { useActionState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Bug, Loader2, Mail, X } from 'lucide-react'
import { enviarReporte, type EstadoDeReporte } from '@/app/dashboard/report-actions'
import { CONTACTO_SOPORTE, FASE, VERSION } from '@/lib/version'
import { useCierreConAtras } from '@/lib/use-cierre-con-atras'

/**
 * "Acerca de AUREM": qué versión estás usando y por dónde avisar que algo falla.
 *
 * Porteado a `document.body` como el resto de los modales: lo abre el menú de
 * perfil, que cuelga del header, y el header tiene `backdrop-blur` — un
 * `fixed` adentro de ese subárbol queda recortado en WebKit. Está documentado
 * en `components/layout/floating-panel.tsx`.
 */
export function AboutModal({ onCerrar }: { onCerrar: () => void }) {
  // Atrás cierra el modal, no la app.
  useCierreConAtras(true, onCerrar)

  const ruta = usePathname()
  const hoja = useRef<HTMLDivElement>(null)
  const [estado, enviar, enviando] = useActionState<EstadoDeReporte, FormData>(enviarReporte, {})

  useEffect(() => {
    function alEscapar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alEscapar)
    return () => document.removeEventListener('keydown', alEscapar)
  }, [onCerrar])

  useEffect(() => {
    hoja.current?.focus({ preventScroll: true })
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-titulo"
      className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-midnight-navy/70 backdrop-blur-sm"
      />

      <div
        ref={hoja}
        tabIndex={-1}
        className="glass-card relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-3xl bg-menu px-5 pt-5 respiro-hoja outline-none sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="fire-gradient glow-gold grid size-10 shrink-0 place-items-center rounded-xl font-display text-base font-extrabold text-midnight-navy">
              A
            </span>
            <div className="flex flex-col">
              <h3
                id="about-titulo"
                className="font-display text-base font-extrabold uppercase tracking-tighter text-gold-leaf"
              >
                Aurem
              </h3>
              <p className="text-[11px] text-subtle">Gestión de finanzas personales</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-subtle transition hover:bg-foreground/5"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* --- Versión ------------------------------------------------------ */}
        <dl className="flex flex-col gap-1.5 rounded-xl border border-glass-stroke/40 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="aurem-caps text-[9px] text-on-surface-variant/70">Versión</dt>
            <dd className="font-mono text-sm font-semibold tabular-nums text-gold-leaf">
              v{VERSION}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="aurem-caps text-[9px] text-on-surface-variant/70">Estado</dt>
            <dd className="text-[11px] text-on-surface-variant">{FASE}</dd>
          </div>
        </dl>

        <div className="h-px bg-glass-stroke/40" />

        {/* --- Reporte de bugs ---------------------------------------------- */}
        <form action={enviar} className="flex flex-col gap-2.5">
          <label htmlFor="reporte" className="flex items-center gap-1.5 text-sm font-medium">
            <Bug className="size-3.5 text-gold-leaf" aria-hidden />
            Reportar una falla
          </label>

          {/* La ruta viaja con el reporte: sin ella, "no anda el botón" no se
              puede reproducir. */}
          <input type="hidden" name="ruta" value={ruta} />

          <textarea
            id="reporte"
            name="mensaje"
            rows={4}
            maxLength={2000}
            required
            disabled={enviando}
            placeholder="¿Qué esperabas que pasara y qué pasó en su lugar?"
            className="resize-y rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-3.5 py-2.5 text-sm outline-none transition placeholder:text-subtle focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60"
          />

          {estado.error && (
            <p
              role="alert"
              className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
            >
              {estado.error}
            </p>
          )}

          {estado.mensaje && (
            <p
              role="status"
              className="rounded-lg border border-income/30 bg-income/10 px-3.5 py-2.5 text-sm text-income"
            >
              {estado.mensaje}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="fire-gradient glow-gold flex cursor-pointer items-center justify-center gap-1.5 self-start rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60"
          >
            {enviando && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {enviando ? 'Enviando…' : 'Enviar reporte'}
          </button>
        </form>

        {/* Contacto directo: el reporte de arriba queda en la base y se revisa
            cuando se revisa. Para algo urgente conviene un canal que avise. */}
        <a
          href={`mailto:${CONTACTO_SOPORTE}?subject=${encodeURIComponent(`AUREM v${VERSION} · reporte`)}`}
          className="flex items-center gap-1.5 text-[11px] text-gold-leaf hover:underline"
        >
          <Mail className="size-3 shrink-0" aria-hidden />
          {CONTACTO_SOPORTE}
        </a>
      </div>
    </div>,
    document.body
  )
}
