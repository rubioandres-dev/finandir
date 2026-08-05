'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, FileText, Loader2, ScanLine, X } from 'lucide-react'
import { guardarTransaccion } from '@/app/dashboard/actions'
import { useModoMoneda } from '@/components/currency-provider'
import { CurrencyOptions } from '@/components/currency-options'
import type { ComprobanteParseado } from '@/app/api/ai/parse-document/route'
import { formatearMonto, hoyEnArgentina, type Moneda } from '@/lib/types'

const CAMPO =
  'rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-3 py-2 text-sm outline-none transition placeholder:text-subtle focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60'
const ETIQUETA = 'flex flex-col gap-1 text-xs font-medium text-muted'

/** Lo que se edita en pantalla: el parseo de la IA, ya en forma de movimiento. */
type Borrador = {
  descripcion: string
  importe: string
  moneda: Moneda
  fecha: string
  categoria: string
  cuotas: number
}

function aBorrador(datos: ComprobanteParseado): Borrador {
  return {
    descripcion: datos.merchant,
    importe: String(datos.total_amount),
    moneda: datos.currency,
    fecha: datos.date,
    categoria: datos.category_name,
    cuotas: datos.is_installment ? (datos.total_installments ?? 1) : 1,
  }
}

/**
 * Confirmación de un comprobante leído por IA.
 *
 * NADA SE GUARDA SOLO. El modal muestra lo que entendió el modelo al lado del
 * comprobante para que se pueda contrastar de un vistazo, y recién guarda
 * cuando el usuario confirma. Es el mismo criterio del Smart Input: la IA
 * propone, la persona decide.
 *
 * Porteado a `document.body` porque lo abre el FAB, que es `fixed`; anidarle
 * otro `fixed` adentro heredaría su contexto de apilado.
 */
export function DocumentScannerModal({
  archivo,
  categorias,
  onCerrar,
}: {
  archivo: File
  /** Nombres de las categorías del usuario, para que la IA elija de ahí. */
  categorias: string[]
  onCerrar: () => void
}) {
  const router = useRouter()
  const { modo } = useModoMoneda()
  const hoja = useRef<HTMLDivElement>(null)

  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [analizando, setAnalizando] = useState(true)
  const [guardando, iniciarGuardado] = useTransition()

  const esImagen = archivo.type.startsWith('image/')

  // URL de la vista previa, y su revocación al desmontar: sin eso el blob
  // queda retenido en memoria hasta que se recargue la página.
  //
  // Se crea en un `useMemo` y no en un efecto porque un `setState` dentro del
  // efecto dispara un render en cascada y lo marca `react-hooks/
  // set-state-in-effect`. El precio es que en StrictMode el render doble de
  // desarrollo puede crear un blob que nadie revoca; en producción no pasa.
  const vistaPrevia = useMemo(
    () => (esImagen ? URL.createObjectURL(archivo) : null),
    [archivo, esImagen]
  )

  useEffect(() => {
    if (!vistaPrevia) return
    return () => URL.revokeObjectURL(vistaPrevia)
  }, [vistaPrevia])

  useEffect(() => {
    function alEscapar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alEscapar)
    return () => document.removeEventListener('keydown', alEscapar)
  }, [onCerrar])

  // Analiza al montar. `cancelado` evita escribir estado si el modal se cerró
  // mientras la petición estaba en vuelo.
  useEffect(() => {
    let cancelado = false

    async function analizar() {
      const cuerpo = new FormData()
      cuerpo.append('file', archivo)
      cuerpo.append('categories', categorias.join('\n'))

      try {
        const respuesta = await fetch('/api/ai/parse-document', { method: 'POST', body: cuerpo })
        const datos = await respuesta.json()

        if (cancelado) return

        if (!respuesta.ok) {
          setError(datos?.error ?? 'No se pudo leer el comprobante.')
        } else {
          setBorrador(aBorrador(datos as ComprobanteParseado))
        }
      } catch {
        if (!cancelado) setError('No se pudo contactar al servidor. Revisá tu conexión.')
      } finally {
        if (!cancelado) setAnalizando(false)
      }
    }

    analizar()
    return () => {
      cancelado = true
    }
  }, [archivo, categorias])

  function guardar() {
    if (!borrador) return

    const importe = Number(borrador.importe.replace(',', '.'))
    if (!Number.isFinite(importe) || importe <= 0) {
      setError('El importe tiene que ser un número mayor a cero.')
      return
    }

    setError(null)
    iniciarGuardado(async () => {
      const resultado = await guardarTransaccion({
        amount: importe,
        type: 'EXPENSE',
        currency: borrador.moneda,
        category_suggested: borrador.categoria || 'Otros',
        description: borrador.descripcion,
        date: borrador.fecha,
        installment_total: borrador.cuotas,
      })

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      onCerrar()
      router.refresh()
    })
  }

  function editar<C extends keyof Borrador>(campo: C, valor: Borrador[C]) {
    setBorrador((previo) => (previo ? { ...previo, [campo]: valor } : previo))
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="escaner-titulo"
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
        className="glass-card safe-bottom relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-3xl bg-menu p-5 sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h3
            id="escaner-titulo"
            className="aurem-caps flex items-center gap-1.5 text-[11px] text-gold-leaf"
          >
            <ScanLine className="size-3.5" aria-hidden />
            Comprobante
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid size-7 cursor-pointer place-items-center rounded-md text-subtle transition hover:bg-foreground/5"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* --- Vista previa del archivo ------------------------------------ */}
        <div className="overflow-hidden rounded-xl border border-glass-stroke/40 bg-charcoal/40">
          {esImagen && vistaPrevia ? (
            // eslint-disable-next-line @next/next/no-img-element -- es un blob: local, next/image no lo optimiza
            <img
              src={vistaPrevia}
              alt="Comprobante a analizar"
              className="max-h-52 w-full bg-midnight-navy/40 object-contain"
            />
          ) : (
            <div className="flex items-center gap-2.5 p-3">
              <FileText className="size-5 shrink-0 text-gold-leaf" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-xs text-on-surface-variant">
                {archivo.name}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-subtle">
                {(archivo.size / 1024).toFixed(0)} KB
              </span>
            </div>
          )}
        </div>

        {/* --- Estados ------------------------------------------------------ */}
        {analizando && (
          <div className="flex flex-col items-center gap-2.5 py-6" role="status">
            <Loader2 className="size-7 animate-spin text-gold-leaf" aria-hidden />
            <p className="text-xs text-on-surface-variant">Leyendo el comprobante…</p>
            <p className="text-[11px] text-subtle">Suele tardar unos segundos.</p>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {/* --- Datos extraídos, editables ----------------------------------- */}
        {borrador && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className={`col-span-2 ${ETIQUETA}`}>
                Comercio
                <input
                  type="text"
                  value={borrador.descripcion}
                  onChange={(e) => editar('descripcion', e.target.value)}
                  maxLength={120}
                  disabled={guardando}
                  className={CAMPO}
                />
              </label>

              <label className={ETIQUETA}>
                Importe total
                <div className="flex overflow-hidden rounded-lg border border-glass-stroke/50 bg-charcoal/60 focus-within:border-gold-leaf">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={borrador.importe}
                    onChange={(e) => editar('importe', e.target.value)}
                    disabled={guardando}
                    className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm tabular-nums outline-none"
                  />
                  <select
                    value={borrador.moneda}
                    onChange={(e) => editar('moneda', e.target.value)}
                    aria-label="Moneda del comprobante"
                    disabled={guardando}
                    className="border-l border-glass-stroke/50 bg-foreground/[0.03] px-2 text-xs font-medium outline-none"
                  >
                    <CurrencyOptions actual={borrador.moneda} />
                  </select>
                </div>
              </label>

              <label className={ETIQUETA}>
                Fecha
                <input
                  type="date"
                  value={borrador.fecha}
                  max={hoyEnArgentina()}
                  onChange={(e) => editar('fecha', e.target.value)}
                  disabled={guardando}
                  className={CAMPO}
                />
              </label>

              <label className={ETIQUETA}>
                Categoría
                <input
                  type="text"
                  list="categorias-escaner"
                  value={borrador.categoria}
                  onChange={(e) => editar('categoria', e.target.value)}
                  maxLength={60}
                  disabled={guardando}
                  className={CAMPO}
                />
                <datalist id="categorias-escaner">
                  {categorias.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>

              <label className={ETIQUETA}>
                Cuotas
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={borrador.cuotas}
                  onChange={(e) => editar('cuotas', Math.max(1, Number(e.target.value) || 1))}
                  disabled={guardando}
                  className={CAMPO}
                />
              </label>
            </div>

            {borrador.cuotas > 1 && (
              <p className="rounded-lg border border-glass-stroke/40 px-3 py-2 text-[11px] leading-snug text-subtle">
                Se van a crear {borrador.cuotas} cuotas de{' '}
                {formatearMonto(
                  (Number(borrador.importe.replace(',', '.')) || 0) / borrador.cuotas,
                  borrador.moneda
                )}
                , una por mes. El importe de arriba es el total de la operación.
              </p>
            )}

            {borrador.moneda !== modo && (
              <p className="rounded-lg border border-budget-warn/30 bg-budget-warn/10 px-3 py-2 text-[11px] leading-snug text-budget-warn">
                Este movimiento va al libro de {borrador.moneda} y estás mirando el de {modo}: no
                lo vas a ver en la lista hasta que cambies de moneda en el header.
              </p>
            )}

            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="fire-gradient glow-gold flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60"
            >
              {guardando ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Check className="size-4" aria-hidden />
              )}
              {guardando ? 'Guardando…' : 'Guardar movimiento'}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
