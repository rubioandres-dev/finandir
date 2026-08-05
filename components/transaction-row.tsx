'use client'

import { useState } from 'react'
import { ArrowLeftRight, Pencil } from 'lucide-react'
import { Monto } from '@/components/monto'
import {
  TransactionEditor,
  type CuentaElegible,
  type MovimientoEditable,
} from '@/components/transaction-editor'
import { IconoCategoria } from '@/lib/category-icons'
import { ETIQUETA_TIPO, formatearFecha, type Moneda } from '@/lib/types'

/**
 * Una fila del historial.
 *
 * Es cliente porque abre el editor, pero recibe TODO ya resuelto por el
 * servidor —incluido el equivalente aproximado— así que no cruza ninguna
 * función el borde servidor/cliente.
 */
export function TransactionRow({
  movimiento,
  categoriaNombre,
  categoriaIcono,
  color,
  equivalente,
  categorias,
  cuentas,
  editable = false,
}: {
  movimiento: MovimientoEditable
  categoriaNombre: string | null
  categoriaIcono: string | undefined
  color: string
  equivalente: { valor: number; moneda: Moneda } | null
  categorias: { id: string; name: string; type: 'INCOME' | 'EXPENSE' }[]
  cuentas: CuentaElegible[]
  editable?: boolean
}) {
  const [editando, setEditando] = useState(false)

  const esIngreso = movimiento.type === 'INCOME'
  const cuotas = movimiento.installment_total ?? 1

  const contenido = (
    <>
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full"
        style={{ backgroundColor: `${color}1F`, color }}
      >
        {movimiento.type === 'TRANSFER' ? (
          <ArrowLeftRight className="size-4" aria-hidden />
        ) : (
          <IconoCategoria icono={categoriaIcono} className="size-4" />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="truncate text-sm font-medium tracking-tight">
          {movimiento.description || ETIQUETA_TIPO[movimiento.type]}
        </span>
        <span className="truncate text-xs text-subtle">
          {categoriaNombre ?? ETIQUETA_TIPO[movimiento.type]} · {formatearFecha(movimiento.date)}
        </span>

        {/* La cuota va en un pill y no como sufijo del subtítulo: es el dato
            que distingue un gasto puntual de uno que va a seguir apareciendo
            todos los meses, y como texto suelto se perdía. */}
        {cuotas > 1 && (
          <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full border border-glass-stroke/60 bg-gold-leaf/[0.08] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-gold-leaf">
            <span aria-hidden>💳</span>
            Cuota {movimiento.installment_current} de {cuotas}
          </span>
        )}
      </div>

      <Monto
        valor={Number(movimiento.amount)}
        moneda={movimiento.currency}
        equivalente={equivalente}
        signo={esIngreso ? '+' : '−'}
        className={`shrink-0 text-sm font-semibold tabular-nums tracking-tight ${
          esIngreso ? 'text-income' : 'text-foreground'
        }`}
      />

      {editable && (
        <Pencil
          className="size-3.5 shrink-0 text-subtle transition group-hover:text-gold-leaf"
          aria-hidden
        />
      )}
    </>
  )

  if (!editable) {
    return <li className="flex items-center gap-3 px-3.5 py-3">{contenido}</li>
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setEditando(true)}
        aria-label={`Editar ${movimiento.description || ETIQUETA_TIPO[movimiento.type]}`}
        className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-gold-leaf/[0.04]"
      >
        {contenido}
      </button>

      {editando && (
        <TransactionEditor
          movimiento={movimiento}
          categorias={categorias}
          cuentas={cuentas}
          onCerrar={() => setEditando(false)}
        />
      )}
    </li>
  )
}
