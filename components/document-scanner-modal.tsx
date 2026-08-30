'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, FileText, Loader2, ScanLine, X } from 'lucide-react'
import { guardarTransaccion } from '@/app/dashboard/actions'
import { useModoMoneda, useFormatoRegional, useTraduccion } from '@/components/currency-provider'
import { CurrencyOptions } from '@/components/currency-options'
import type { Escaneo } from '@/components/escaner-store'
import type { ComprobanteParseado } from '@/app/api/ai/parse-document/route'
import {
  hoyEnArgentina,
  type CuentaElegible,
  type Moneda,
} from '@/lib/types'

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
 *
 * NO LEE EL COMPROBANTE: eso lo hace `escaner-store`, que sobrevive a que este
 * modal se cierre. Acá solo se muestra lo que el store tenga y se confirma.
 */
export function DocumentScannerModal({
  escaneo,
  categorias,
  cuentas = [],
  onMinimizar,
  onDescartar,
}: {
  /** La lectura en curso o terminada, tal como la publica el store. */
  escaneo: Escaneo
  /** Nombres de las categorías del usuario, para que la IA elija de ahí. */
  categorias: string[]
  /** Cuentas y tarjetas disponibles como destino del gasto. */
  cuentas?: CuentaElegible[]
  /** Sale de pantalla; la lectura sigue. Es lo que hace cerrar el modal. */
  onMinimizar: () => void
  /** Tira el comprobante. Solo se llega acá a propósito o tras guardar. */
  onDescartar: () => void
}) {
  const { formatearMonto } = useFormatoRegional()
  const { t } = useTraduccion()
  const router = useRouter()
  const { modo } = useModoMoneda()
  const hoja = useRef<HTMLDivElement>(null)

  const { archivo, enPantalla } = escaneo
  const analizando = escaneo.fase === 'analizando'

  /**
   * Solo lo que el usuario TOCÓ, no el movimiento entero.
   *
   * El borrador se deriva del parseo en el render en vez de copiarse a estado
   * con un efecto: copiarlo exigiría un `setState` dentro de un efecto —que el
   * compilador de React marca— y dejaría un frame con los campos vacíos justo
   * cuando llega el resultado. Superponiendo las ediciones, el dato de la IA y
   * lo corregido a mano conviven sin sincronización.
   */
  const [editado, setEditado] = useState<Partial<Borrador>>({})
  const [cuentaId, setCuentaId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciarGuardado] = useTransition()

  const borrador = useMemo(() => {
    if (!escaneo.datos) return null
    return { ...aBorrador(escaneo.datos), ...editado }
  }, [escaneo.datos, editado])

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
      // Minimizado sigue montado (ver el `hidden` de abajo): sin esta guarda
      // el Escape de otro modal encimado también pasaría por acá.
      if (evento.key === 'Escape' && enPantalla) onMinimizar()
    }
    document.addEventListener('keydown', alEscapar)
    return () => document.removeEventListener('keydown', alEscapar)
  }, [onMinimizar, enPantalla])

  /**
   * Lo que se ve en rojo: primero el error de guardado —es la acción que el
   * usuario acaba de intentar— y si no, la falla de lectura que trae el store.
   */
  const mensajeDeError =
    error ??
    (escaneo.falla ? ('clave' in escaneo.falla ? t(escaneo.falla.clave) : escaneo.falla.texto) : null)

  function guardar() {
    if (!borrador) return

    const importe = Number(borrador.importe.replace(',', '.'))
    if (!Number.isFinite(importe) || importe <= 0) {
      setError(t('escaner.errorImporte'))
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
        account_id: cuentaId || null,
        installment_total: borrador.cuotas,
      })

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      // Guardado y adentro: acá sí se tira el comprobante, ya cumplió.
      onDescartar()
      router.refresh()
    })
  }

  function editar<C extends keyof Borrador>(campo: C, valor: Borrador[C]) {
    // Cambiar de moneda invalida la cuenta elegida: `guardarTransaccion`
    // rechaza el par si no coinciden, y el select ya no la va a listar.
    if (campo === 'moneda') setCuentaId('')
    setEditado((previo) => ({ ...previo, [campo]: valor }))
  }

  const cuentasCompatibles = borrador
    ? cuentas.filter((c) => c.currency.trim() === borrador.moneda)
    : []

  if (typeof document === 'undefined') return null

  return createPortal(
    // Minimizado se OCULTA, no se desmonta: desmontarlo tiraría lo editado a
    // mano y el `objectURL` de la vista previa, y el usuario que vuelve desde
    // la píldora espera encontrar el formulario como lo dejó.
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="escaner-titulo"
      className={`fixed inset-0 z-[85] items-end justify-center sm:items-center ${
        enPantalla ? 'flex' : 'hidden'
      }`}
    >
      <button
        type="button"
        aria-label={t('escaner.minimizar')}
        onClick={onMinimizar}
        className="absolute inset-0 bg-midnight-navy/70 backdrop-blur-sm"
      />

      <div
        ref={hoja}
        className="glass-card relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-3xl bg-menu px-5 pt-5 respiro-hoja sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h3
            id="escaner-titulo"
            className="aurem-caps flex items-center gap-1.5 text-[11px] text-gold-leaf"
          >
            <ScanLine className="size-3.5" aria-hidden />
            {t('escaner.titulo')}
          </h3>
          <button
            type="button"
            onClick={onMinimizar}
            aria-label={t('escaner.minimizar')}
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
              alt={t('escaner.altPrevia')}
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
            <p className="text-xs text-on-surface-variant">{t('escaner.leyendo')}</p>
            <p className="text-[11px] text-subtle">{t('escaner.demora')}</p>

            {/* Se dice ANTES de que cierre, no después: es la única forma de
                que el toque afuera deje de sentirse como una cancelación. */}
            <p className="max-w-[22rem] text-balance text-center text-[11px] leading-snug text-subtle">
              {t('escaner.sigueEnSegundoPlano')}
            </p>

            {/* Cancelar de verdad existe, pero hay que pedirlo: cerrar no
                alcanza. Es la contracara de que nada se pierda por accidente. */}
            <button
              type="button"
              onClick={onDescartar}
              className="cursor-pointer rounded-md px-2 py-1 text-[11px] text-subtle underline underline-offset-2 transition hover:text-on-surface-variant"
            >
              {t('escaner.cancelarLectura')}
            </button>
          </div>
        )}

        {mensajeDeError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {mensajeDeError}
          </p>
        )}

        {/* Sin formulario que confirmar, la única salida sensata es tirarlo:
            minimizar un comprobante ilegible solo deja una píldora en rojo. */}
        {escaneo.fase === 'error' && (
          <button
            type="button"
            onClick={onDescartar}
            className="cursor-pointer rounded-lg border border-glass-stroke/50 px-4 py-2.5 text-sm text-on-surface-variant transition active:scale-95 hover:border-gold-leaf"
          >
            {t('escaner.descartar')}
          </button>
        )}

        {/* --- Datos extraídos, editables ----------------------------------- */}
        {borrador && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className={`col-span-2 ${ETIQUETA}`}>
                {t('escaner.comercio')}
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
                {t('escaner.importeTotal')}
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
                    aria-label={t('escaner.monedaDelComprobante')}
                    disabled={guardando}
                    className="border-l border-glass-stroke/50 bg-foreground/[0.03] px-2 text-xs font-medium outline-none"
                  >
                    <CurrencyOptions actual={borrador.moneda} />
                  </select>
                </div>
              </label>

              <label className={ETIQUETA}>
                {t('comun.fecha')}
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
                {t('objetivos.categoria')}
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
                {t('comun.cuotas')}
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

              {/* Solo cuentas de la misma moneda: la action rechaza el resto.
                  Un ticket en cuotas casi siempre se pagó con tarjeta, y sin
                  este selector el gasto caía en la cuenta líquida por defecto. */}
              <label className={`col-span-2 ${ETIQUETA}`}>
                {t('comun.cuenta')}
                <select
                  value={cuentaId}
                  onChange={(e) => setCuentaId(e.target.value)}
                  disabled={guardando || cuentasCompatibles.length === 0}
                  className={CAMPO}
                >
                  <option value="">
                    {cuentasCompatibles.length === 0
                      ? t('escaner.sinCuentas', { moneda: borrador.moneda })
                      : t('comun.cuentaPorDefecto')}
                  </option>
                  {cuentasCompatibles.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>
                      {cuenta.name}
                      {cuenta.type === 'CREDIT_CARD' ? ` ${t('escaner.esTarjeta')}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {borrador.cuotas > 1 && (
              <p className="rounded-lg border border-glass-stroke/40 px-3 py-2 text-[11px] leading-snug text-subtle">
                {t('escaner.avisoCuotas', {
                  cuotas: borrador.cuotas,
                  monto: formatearMonto(
                    (Number(borrador.importe.replace(',', '.')) || 0) / borrador.cuotas,
                    borrador.moneda
                  ),
                })}
              </p>
            )}

            {borrador.moneda !== modo && (
              <p className="rounded-lg border border-budget-warn/30 bg-budget-warn/10 px-3 py-2 text-[11px] leading-snug text-budget-warn">
                {t('escaner.avisoMoneda', { moneda: borrador.moneda, actual: modo })}
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
              {guardando ? t('comun.guardando') : t('escaner.guardar')}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
