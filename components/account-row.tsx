'use client'

import { useFormatoRegional } from '@/components/currency-provider'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  Banknote,
  CreditCard,
  Landmark,
  Loader2,
  Pencil,
  PiggyBank,
  Trash2,
  Wallet,
} from 'lucide-react'
import { AccountForm } from '@/components/account-form'
import { borrarCuenta } from '@/app/dashboard/accounts/actions'
import {
  ETIQUETA_TIPO_CUENTA,
  type Cuenta,
  type DetalleTarjeta,
  type Moneda,
  type TipoDeCuenta,
} from '@/lib/types'

const ICONO: Record<TipoDeCuenta, typeof Wallet> = {
  BANK: Landmark,
  WALLET: Wallet,
  CASH: Banknote,
  INVESTMENT: PiggyBank,
  CREDIT_CARD: CreditCard,
}

type Props = {
  cuenta: Cuenta
  detalle?: DetalleTarjeta
}

/**
 * Fila de cuenta con edición en el lugar: al tocar el lápiz, la fila se
 * reemplaza por el formulario precargado con TODOS los datos de la cuenta.
 */
export function AccountRow({ cuenta, detalle }: Props) {
  const { formatearMonto } = useFormatoRegional()
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [borrando, iniciarBorrado] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const Icono = ICONO[cuenta.type] ?? Wallet
  const esTarjeta = cuenta.type === 'CREDIT_CARD'
  const saldo = Number(cuenta.balance ?? 0)
  // En una tarjeta el saldo negativo es deuda: se muestra en positivo.
  const mostrado = esTarjeta ? Math.abs(saldo) : saldo

  const descripcion = detalle
    ? `cierra el ${detalle.closing_day} · vence el ${detalle.due_day}`
    : null

  function eliminar() {
    iniciarBorrado(async () => {
      const resultado = await borrarCuenta(cuenta.id)
      if (!resultado.ok) {
        setError(resultado.error)
        setConfirmando(false)
        return
      }
      setError(null)
      router.refresh()
    })
  }

  if (editando) {
    return (
      <li className="p-3">
        <AccountForm cuenta={cuenta} detalle={detalle} onCerrar={() => setEditando(false)} />
      </li>
    )
  }

  return (
    <li className="flex flex-col gap-2 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full ${
            esTarjeta ? 'bg-expense/10 text-expense' : 'bg-primary/10 text-primary'
          }`}
        >
          <Icono className="size-4" aria-hidden />
        </span>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium tracking-tight">{cuenta.name}</span>
          <span className="truncate text-xs text-subtle">
            {ETIQUETA_TIPO_CUENTA[cuenta.type]}
            {descripcion && ` · ${descripcion}`}
          </span>
        </div>

        <div className="flex shrink-0 flex-col items-end">
          <span
            className={`text-sm font-semibold tabular-nums tracking-tight ${
              esTarjeta && saldo < 0 ? 'text-expense' : ''
            }`}
          >
            {formatearMonto(mostrado, cuenta.currency.trim() as Moneda)}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-subtle">
            {esTarjeta ? 'Deuda' : cuenta.is_liquid ? 'Líquido' : 'No líquido'}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setEditando(true)}
            aria-label={`Editar ${cuenta.name}`}
            title="Editar"
            className="grid size-8 place-items-center rounded-md text-subtle transition hover:bg-foreground/5 hover:text-gold-leaf"
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            disabled={borrando}
            aria-label={`Borrar ${cuenta.name}`}
            title="Borrar"
            className="grid size-8 place-items-center rounded-md text-subtle transition hover:bg-expense/10 hover:text-expense disabled:opacity-50"
          >
            {borrando ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-3.5" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {confirmando && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-expense/30 bg-expense/[0.07] px-3 py-2">
          <span className="text-[11px] text-expense">¿Borrar «{cuenta.name}»?</span>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={eliminar}
              disabled={borrando}
              className="rounded-md bg-expense px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
            >
              Borrar
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="rounded-md px-2.5 py-1 text-[11px] font-medium text-subtle hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-[11px] text-expense">
          {error}
        </p>
      )}
    </li>
  )
}
