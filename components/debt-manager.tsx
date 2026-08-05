'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, Loader2, Plus, Trash2, X } from 'lucide-react'
import {
  borrarDeuda,
  guardarDeuda,
  registrarPagoDeDeuda,
  type DeudaAGuardar,
} from '@/app/dashboard/accounts/actions'
import { CurrencyOptions } from '@/components/currency-options'
import { formatearMonto, type Deuda, type Moneda, type TipoDeDeuda } from '@/lib/types'

const CAMPO =
  'rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary'
const ETIQUETA = 'flex flex-col gap-1 text-xs font-medium text-muted'

function FilaDeuda({ deuda }: { deuda: Deuda }) {
  const router = useRouter()
  const [pagando, setPagando] = useState(false)
  const [monto, setMonto] = useState('')
  const [enCurso, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const total = Number(deuda.total_amount)
  const pendiente = Number(deuda.remaining_amount)
  const pagado = total - pendiente
  const avance = total > 0 ? (pagado / total) * 100 : 0
  const meDeben = deuda.type === 'OWED_TO_ME'

  function pagar() {
    const valor = Number(monto.replace(',', '.'))
    if (!Number.isFinite(valor) || valor <= 0) {
      setError('Ingresá un monto válido.')
      return
    }

    iniciar(async () => {
      const resultado = await registrarPagoDeDeuda(deuda.id, valor)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setError(null)
      setMonto('')
      setPagando(false)
      router.refresh()
    })
  }

  function eliminar() {
    iniciar(async () => {
      const resultado = await borrarDeuda(deuda.id)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <li className={`flex flex-col gap-2 px-3.5 py-3 ${deuda.is_settled ? 'opacity-55' : ''}`}>
      <div className="flex items-center gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full ${
            meDeben ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'
          }`}
        >
          {meDeben ? (
            <ArrowDownLeft className="size-4" aria-hidden />
          ) : (
            <ArrowUpRight className="size-4" aria-hidden />
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium tracking-tight">
            {deuda.counterparty_name}
          </span>
          <span className="truncate text-xs text-subtle">
            {meDeben ? 'Me debe' : 'Le debo'}
            {deuda.description && ` · ${deuda.description}`}
            {deuda.due_date && ` · vence ${deuda.due_date}`}
          </span>
        </div>

        <div className="flex shrink-0 flex-col items-end">
          <span
            className={`text-sm font-semibold tabular-nums tracking-tight ${
              meDeben ? 'text-income' : 'text-expense'
            }`}
          >
            {formatearMonto(pendiente, deuda.currency)}
          </span>
          <span className="text-[10px] tabular-nums text-subtle">
            de {formatearMonto(total, deuda.currency)}
          </span>
        </div>
      </div>

      {!deuda.is_settled && (
        <>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
            role="progressbar"
            aria-valuenow={Math.round(avance)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Saldado de ${deuda.counterparty_name}`}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                meDeben ? 'bg-income' : 'bg-budget-warn'
              }`}
              style={{ width: `${Math.min(avance, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] tabular-nums text-subtle">
              {avance.toFixed(0)}% saldado
            </span>

            {pagando ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="100"
                  autoFocus
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') pagar()
                    if (e.key === 'Escape') setPagando(false)
                  }}
                  placeholder="Monto"
                  className="w-24 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={pagar}
                  disabled={enCurso}
                  aria-label="Registrar pago"
                  className="grid size-7 place-items-center rounded-md text-income hover:bg-primary/10 disabled:opacity-50"
                >
                  {enCurso ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Check className="size-3.5" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPagando(false)}
                  aria-label="Cancelar"
                  className="grid size-7 place-items-center rounded-md text-subtle hover:bg-foreground/5"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPagando(true)}
                  className="rounded-md px-2 py-0.5 text-[11px] font-medium text-muted transition hover:bg-foreground/5 hover:text-foreground"
                >
                  Registrar pago
                </button>
                <button
                  type="button"
                  onClick={eliminar}
                  disabled={enCurso}
                  aria-label="Borrar deuda"
                  className="grid size-7 place-items-center rounded-md text-subtle transition hover:bg-expense/10 hover:text-expense disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {deuda.is_settled && (
        <span className="text-[11px] font-medium text-income">Saldada</span>
      )}

      {error && (
        <p role="alert" className="text-[11px] text-expense">
          {error}
        </p>
      )}
    </li>
  )
}

export function DebtManager({ deudas }: { deudas: Deuda[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [enCurso, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [tipo, setTipo] = useState<TipoDeDeuda>('OWED_TO_ME')
  const [nombre, setNombre] = useState('')
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState<Moneda>('ARS')
  const [vence, setVence] = useState('')
  const [descripcion, setDescripcion] = useState('')

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()

    const entrada: DeudaAGuardar = {
      counterparty_name: nombre,
      total_amount: Number(monto.replace(',', '.')),
      currency: moneda,
      type: tipo,
      due_date: vence || null,
      description: descripcion.trim() || null,
    }

    iniciar(async () => {
      const resultado = await guardarDeuda(entrada)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setError(null)
      setNombre('')
      setMonto('')
      setVence('')
      setDescripcion('')
      setAbierto(false)
      router.refresh()
    })
  }

  const pendientes = deudas.filter((d) => !d.is_settled)
  const saldadas = deudas.filter((d) => d.is_settled)

  return (
    <div className="flex flex-col gap-4">
      {abierto ? (
        <form
          onSubmit={enviar}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="aurem-caps text-[11px] text-gold-leaf">Nueva deuda</h3>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar"
              className="grid size-7 place-items-center rounded-md text-subtle hover:bg-foreground/5"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div
            role="group"
            aria-label="Tipo de deuda"
            className="flex rounded-lg border border-border p-0.5"
          >
            {(['OWED_TO_ME', 'OWED_BY_ME'] as TipoDeDeuda[]).map((opcion) => (
              <button
                key={opcion}
                type="button"
                onClick={() => setTipo(opcion)}
                aria-pressed={tipo === opcion}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  tipo === opcion
                    ? opcion === 'OWED_TO_ME'
                      ? 'bg-income/15 text-income'
                      : 'bg-expense/15 text-expense'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                {opcion === 'OWED_TO_ME' ? 'Me deben' : 'Debo'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className={`col-span-2 ${ETIQUETA}`}>
              {tipo === 'OWED_TO_ME' ? '¿Quién te debe?' : '¿A quién le debés?'}
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                maxLength={80}
                placeholder="Nombre"
                className={CAMPO}
              />
            </label>

            <label className={ETIQUETA}>
              Monto
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                required
                className={`${CAMPO} tabular-nums`}
              />
            </label>

            <label className={ETIQUETA}>
              Moneda
              <select
                value={moneda}
                onChange={(e) => setMoneda(e.target.value as Moneda)}
                className={CAMPO}
              >
                <CurrencyOptions actual={moneda} />
              </select>
            </label>

            <label className={ETIQUETA}>
              Vence (opcional)
              <input
                type="date"
                value={vence}
                onChange={(e) => setVence(e.target.value)}
                className={CAMPO}
              />
            </label>

            <label className={ETIQUETA}>
              Nota (opcional)
              <input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                maxLength={200}
                placeholder="Cena, préstamo…"
                className={CAMPO}
              />
            </label>
          </div>

          {error && (
            <p role="alert" className="text-xs text-expense">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={enCurso || !nombre.trim() || !monto}
            className="btn-gold flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider disabled:opacity-50"
          >
            {enCurso && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Guardar
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-3 text-sm font-medium text-muted transition hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden />
          Registrar deuda o préstamo
        </button>
      )}

      {pendientes.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {pendientes.map((deuda) => (
            <FilaDeuda key={deuda.id} deuda={deuda} />
          ))}
        </ul>
      )}

      {saldadas.length > 0 && (
        <details className="flex flex-col gap-2">
          <summary className="cursor-pointer text-xs font-medium text-subtle">
            {saldadas.length} {saldadas.length === 1 ? 'saldada' : 'saldadas'}
          </summary>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {saldadas.map((deuda) => (
              <FilaDeuda key={deuda.id} deuda={deuda} />
            ))}
          </ul>
        </details>
      )}

      {deudas.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-subtle">
          No tenés deudas ni préstamos registrados.
        </p>
      )}
    </div>
  )
}
