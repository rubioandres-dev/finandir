import { TransactionRow } from '@/components/transaction-row'
import type { CuentaElegible } from '@/components/transaction-editor'
import type { Categoria, Moneda, Transaccion } from '@/lib/types'

const COLOR_SIN_CATEGORIA = '#64748B'

export type FilaMovimiento = Pick<
  Transaccion,
  | 'id'
  | 'amount'
  | 'currency'
  | 'amount_usd'
  | 'type'
  | 'description'
  | 'date'
  | 'category_id'
  // El editor lo necesita para preseleccionar la cuenta real del movimiento.
  // Faltaba, y por eso el selector de cuenta arrancaba vacío ofreciendo "dejar
  // como está" en vez de mostrar con qué cuenta se había cargado.
  | 'account_id'
  // Necesarios para saber si la fila es parte de un plan de cuotas, que es lo
  // que decide qué se puede editar.
  | 'installment_current'
  | 'installment_total'
  | 'parent_transaction_id'
>

type Props = {
  movimientos: FilaMovimiento[]
  categorias: Categoria[]
  /** Equivalente aproximado en la otra moneda; se muestra solo con ≈ activado. */
  equivalente?: (t: FilaMovimiento) => { valor: number; moneda: Moneda } | null
  /** Cuentas a las que se puede mover un movimiento al editarlo. */
  cuentas?: CuentaElegible[]
  /** Si las filas abren el editor al tocarlas. */
  editable?: boolean
  vacio?: React.ReactNode
}

/**
 * Historial de movimientos.
 *
 * Sigue siendo Server Component: `equivalente` es una función y las funciones
 * no cruzan el borde servidor/cliente. Se resuelve acá, por fila, y a
 * `<TransactionRow>` —que sí es cliente— le llega solo el valor.
 */
export function TransactionList({
  movimientos,
  categorias,
  equivalente,
  cuentas = [],
  editable = false,
  vacio,
}: Props) {
  const porId = new Map(categorias.map((c) => [c.id, c]))

  if (movimientos.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-subtle">
        {vacio ?? 'Todavía no registraste movimientos.'}
      </p>
    )
  }

  const paraElEditor = categorias
    .filter((c) => c.type === 'INCOME' || c.type === 'EXPENSE')
    .map((c) => ({ id: c.id, name: c.name, type: c.type }))

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {movimientos.map((movimiento) => {
        const categoria = movimiento.category_id ? porId.get(movimiento.category_id) : undefined

        return (
          <TransactionRow
            key={movimiento.id}
            movimiento={movimiento}
            categoriaNombre={categoria?.name ?? null}
            categoriaIcono={categoria?.icon}
            color={categoria?.color ?? COLOR_SIN_CATEGORIA}
            equivalente={equivalente?.(movimiento) ?? null}
            categorias={paraElEditor}
            cuentas={cuentas}
            editable={editable}
          />
        )
      })}
    </ul>
  )
}
