import { ArrowLeftRight } from 'lucide-react'
import { Monto } from '@/components/monto'
import { IconoCategoria } from '@/lib/category-icons'
import { ETIQUETA_TIPO, formatearFecha, type Categoria, type Transaccion } from '@/lib/types'

const COLOR_SIN_CATEGORIA = '#64748B'

export type FilaMovimiento = Pick<
  Transaccion,
  'id' | 'amount' | 'currency' | 'amount_usd' | 'type' | 'description' | 'date' | 'category_id'
>

type Props = {
  movimientos: FilaMovimiento[]
  categorias: Categoria[]
  /** Equivalente aproximado en la otra moneda; se muestra solo con ≈ activado. */
  equivalente?: (t: FilaMovimiento) => { valor: number; moneda: 'ARS' | 'USD' } | null
  vacio?: React.ReactNode
}

export function TransactionList({ movimientos, categorias, equivalente, vacio }: Props) {
  const porId = new Map(categorias.map((c) => [c.id, c]))

  if (movimientos.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-subtle">
        {vacio ?? 'Todavía no registraste movimientos.'}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {movimientos.map((movimiento) => {
        const categoria = movimiento.category_id ? porId.get(movimiento.category_id) : undefined
        const esIngreso = movimiento.type === 'INCOME'
        const color = categoria?.color ?? COLOR_SIN_CATEGORIA

        return (
          <li key={movimiento.id} className="flex items-center gap-3 px-3.5 py-3">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-full"
              style={{ backgroundColor: `${color}1F`, color }}
            >
              {movimiento.type === 'TRANSFER' ? (
                <ArrowLeftRight className="size-4" aria-hidden />
              ) : (
                <IconoCategoria icono={categoria?.icon} className="size-4" />
              )}
            </span>

            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium tracking-tight">
                {movimiento.description || ETIQUETA_TIPO[movimiento.type]}
              </span>
              <span className="truncate text-xs text-subtle">
                {categoria?.name ?? ETIQUETA_TIPO[movimiento.type]} ·{' '}
                {formatearFecha(movimiento.date)}
              </span>
            </div>

            <Monto
              valor={Number(movimiento.amount)}
              moneda={movimiento.currency}
              equivalente={equivalente?.(movimiento) ?? null}
              signo={esIngreso ? '+' : '−'}
              className={`shrink-0 text-sm font-semibold tabular-nums tracking-tight ${
                esIngreso ? 'text-income' : 'text-foreground'
              }`}
            />
          </li>
        )
      })}
    </ul>
  )
}
