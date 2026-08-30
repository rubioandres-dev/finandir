'use client'

import { useFormatoRegional, useTraduccion } from '@/components/currency-provider'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react'
import {
  deleteTransaction,
  updateTransaction,
  type EdicionDeMovimiento,
} from '@/lib/transactions-actions'
import { hoyEnArgentina, type Moneda } from '@/lib/types'
import { useCierreConAtras } from '@/lib/use-cierre-con-atras'

const CUOTAS_COMUNES = [1, 3, 6, 9, 12, 18, 24]

const CAMPO =
  'rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary'
const ETIQUETA = 'flex flex-col gap-1 text-xs font-medium text-muted'

export type MovimientoEditable = {
  id: string
  amount: number
  currency: Moneda
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  description: string | null
  date: string
  category_id: string | null
  /** Cuenta con la que se cargó. `not null` en la base desde schema.sql. */
  account_id: string
  installment_current: number | null
  installment_total: number | null
  parent_transaction_id: string | null
}

export type CuentaElegible = { id: string; name: string; type: string; currency: string }

function aNumero(valor: string): number {
  return Number(valor.trim().replace(',', '.'))
}

/**
 * Modal de edición y borrado de un movimiento.
 *
 * Lo que se puede editar depende de si la fila es parte de un plan de cuotas,
 * y eso se decide acá y en `updateTransaction` con el mismo criterio:
 *
 *   · una cuota HIJA se edita sola, sin tocar el plan. Ofrecerle cambiar la
 *     cantidad de cuotas sería ofrecerle destruir a sus hermanas.
 *   · la MADRE de un plan (o un movimiento suelto) sí puede cambiar la
 *     cantidad de cuotas: el plan entero se rehace.
 */
export function TransactionEditor({
  movimiento,
  categorias,
  cuentas,
  onCerrar,
}: {
  movimiento: MovimientoEditable
  categorias: { id: string; name: string; type: 'INCOME' | 'EXPENSE' }[]
  cuentas: CuentaElegible[]
  onCerrar: () => void
}) {
  // Atrás cierra el modal, no la app.
  useCierreConAtras(true, onCerrar)

  const { formatearMonto } = useFormatoRegional()
  const { t } = useTraduccion()
  const router = useRouter()
  const [guardando, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)

  const cuotasOriginales = movimiento.installment_total ?? 1
  const esHijaDePlan = cuotasOriginales > 1 && movimiento.parent_transaction_id !== null
  const esMadreDePlan = cuotasOriginales > 1 && movimiento.parent_transaction_id === null

  const categoriaActual = categorias.find((c) => c.id === movimiento.category_id)
  const disponibles = categorias.filter((c) =>
    movimiento.type === 'INCOME' ? c.type === 'INCOME' : c.type === 'EXPENSE'
  )

  const [monto, setMonto] = useState(String(Number(movimiento.amount)))
  const [fecha, setFecha] = useState(movimiento.date)
  const [descripcion, setDescripcion] = useState(movimiento.description ?? '')
  const [categoria, setCategoria] = useState(categoriaActual?.name ?? disponibles[0]?.name ?? '')
  // Arranca en la cuenta REAL del movimiento, no en vacío. Antes el campo
  // empezaba sin valor y la opción vacía decía "dejar como está": el editor no
  // recibía `account_id`, así que no tenía forma de saber cuál mostrar. La
  // consecuencia era que la pregunta "¿de qué cuenta salió esto?" no se podía
  // responder desde la pantalla que existe justamente para revisarlo.
  const [cuentaId, setCuentaId] = useState(movimiento.account_id)
  const [cuotas, setCuotas] = useState(cuotasOriginales)

  // La lista llega filtrada por la moneda activa, y el trigger de migrations/002
  // obliga a que cuenta y movimiento compartan moneda: la cuenta propia tendría
  // que estar siempre. Si no está —una fila anterior a ese trigger—, se agrega
  // igual. Dejar el select en blanco haría que guardar moviera el movimiento a
  // otra cuenta sin que nadie lo pidiera.
  const cuentaPropiaListada = cuentas.some((c) => c.id === movimiento.account_id)

  useEffect(() => {
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alTeclear)
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = previo
    }
  }, [onCerrar])

  function guardar(evento: React.FormEvent) {
    evento.preventDefault()

    const importe = aNumero(monto)
    if (!Number.isFinite(importe) || importe <= 0) {
      setError('El importe tiene que ser mayor a cero.')
      return
    }

    const entrada: EdicionDeMovimiento = {
      amount: importe,
      date: fecha,
      category_suggested: movimiento.type === 'TRANSFER' ? '' : categoria,
      description: descripcion,
      account_id: cuentaId || null,
      // Una hija nunca reescribe el plan.
      installment_total: esHijaDePlan ? undefined : cuotas,
    }

    iniciar(async () => {
      const resultado = await updateTransaction(movimiento.id, entrada)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      onCerrar()
      router.refresh()
    })
  }

  function borrar() {
    iniciar(async () => {
      const resultado = await deleteTransaction(movimiento.id)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      onCerrar()
      router.refresh()
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('mov.editar')}
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-midnight-navy/70 backdrop-blur-sm"
      />

      <form
        onSubmit={guardar}
        className="glass-card relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-3xl bg-menu px-5 pt-5 respiro-hoja sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="aurem-caps text-[11px] text-gold-leaf">{t('mov.editar')}</h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid size-7 place-items-center rounded-md text-subtle hover:bg-foreground/5"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Contexto del plan: sin esto no se entiende por qué el campo de
            cuotas aparece o no. */}
        {cuotasOriginales > 1 && (
          <p className="flex items-start gap-2 rounded-lg border border-glass-stroke/50 bg-gold-leaf/[0.05] px-3 py-2 text-[11px] leading-snug text-on-surface-variant">
            <AlertTriangle className="mt-px size-3.5 shrink-0 text-gold-leaf" aria-hidden />
            {esHijaDePlan ? (
              <>
                Es la cuota {movimiento.installment_current} de {cuotasOriginales}. Los cambios
                afectan solo a esta cuota, no al resto del plan.
              </>
            ) : (
              <>
                Es la primera cuota de un plan de {cuotasOriginales}. Si guardás, el plan completo
                se vuelve a generar con los valores nuevos.
              </>
            )}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className={ETIQUETA}>
            Importe ({movimiento.currency})
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              required
              className={`${CAMPO} tabular-nums`}
            />
          </label>

          <label className={ETIQUETA}>
            {t('comun.fecha')}
            <input
              type="date"
              value={fecha}
              max={hoyEnArgentina()}
              onChange={(e) => setFecha(e.target.value)}
              required
              className={CAMPO}
            />
          </label>

          {movimiento.type !== 'TRANSFER' && (
            <label className={ETIQUETA}>
              {t('objetivos.categoria')}
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className={CAMPO}
              >
                {disponibles.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className={ETIQUETA}>
            {t('comun.cuenta')}
            <select
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
              className={CAMPO}
            >
              {!cuentaPropiaListada && (
                <option value={movimiento.account_id}>{t('mov.cuentaActual')}</option>
              )}
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.type === 'CREDIT_CARD' ? `💳 ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </label>

          {/* Solo donde cambiarlo no rompe nada ajeno. */}
          {!esHijaDePlan && (
            <label className={ETIQUETA}>
              {t('comun.cuotas')}
              <select
                value={cuotas}
                onChange={(e) => setCuotas(Number(e.target.value))}
                className={`${CAMPO} tabular-nums`}
              >
                {CUOTAS_COMUNES.map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? 'Un pago' : `${n} cuotas`}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className={`col-span-2 ${ETIQUETA}`}>
            {t('comun.descripcion')}
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={120}
              required
              className={CAMPO}
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="text-xs text-expense">
            {error}
          </p>
        )}

        {confirmandoBorrado ? (
          <div className="flex flex-col gap-2.5 rounded-xl border border-expense/40 bg-expense/10 p-3">
            <p className="text-xs leading-snug text-on-background">
              ¿Eliminar este movimiento? Se ajustará el saldo de tu cuenta.
              {esMadreDePlan && (
                <strong className="mt-1 block font-semibold text-expense">
                  Se borran las {cuotasOriginales} cuotas del plan, no solo esta.
                </strong>
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={borrar}
                disabled={guardando}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-expense px-3 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
              >
                {guardando && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                Sí, eliminar
              </button>
              <button
                type="button"
                onClick={() => setConfirmandoBorrado(false)}
                disabled={guardando}
                className="rounded-lg border border-glass-stroke/60 px-3 py-2 text-xs font-medium text-on-surface-variant disabled:opacity-50"
              >
                {t('comun.cancelar')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={guardando || !descripcion.trim()}
              className="btn-gold flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider disabled:opacity-50"
            >
              {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t('mov.guardarCambios')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmandoBorrado(true)}
              disabled={guardando}
              aria-label="Eliminar movimiento"
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-expense/40 text-expense transition hover:bg-expense/10 disabled:opacity-50"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        )}

        <p className="text-[10px] leading-snug text-subtle">
          El saldo de la cuenta lo ajusta la base automáticamente:{' '}
          {formatearMonto(Number(movimiento.amount), movimiento.currency)} se revierte y se aplica
          el importe nuevo.
        </p>
      </form>
    </div>
  )
}
