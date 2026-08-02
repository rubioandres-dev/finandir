'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { guardarPresupuesto } from '@/app/dashboard/actions'
import { IconoCategoria } from '@/lib/category-icons'
import { formatoMoneda } from '@/lib/types'

export type PresupuestoDeCategoria = {
  id: string
  nombre: string
  icono: string
  color: string
  presupuesto: number | null
  gastado: number
}

/**
 * Bandas de color. El pedido era verde <75%, ámbar 75-95% y rojo al superar el
 * 100%; el tramo 95-100% quedaba sin definir, así que el ámbar llega hasta el
 * 100% para no dejar un hueco.
 */
function estilosSegunAvance(porcentaje: number) {
  if (porcentaje >= 100) {
    return { barra: 'bg-budget-over', texto: 'text-expense' }
  }
  if (porcentaje >= 75) {
    return { barra: 'bg-budget-warn', texto: 'text-budget-warn' }
  }
  return { barra: 'bg-budget-ok', texto: 'text-income' }
}

function FilaPresupuesto({ categoria }: { categoria: PresupuestoDeCategoria }) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(categoria.presupuesto?.toString() ?? '')
  const [guardando, iniciarGuardado] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const presupuesto = categoria.presupuesto ?? 0
  const porcentaje = presupuesto > 0 ? (categoria.gastado / presupuesto) * 100 : 0
  const estilos = estilosSegunAvance(porcentaje)
  const restante = presupuesto - categoria.gastado

  function guardar() {
    const limpio = valor.trim()
    const monto = limpio === '' ? null : Number(limpio.replace(',', '.'))

    if (monto !== null && (!Number.isFinite(monto) || monto < 0)) {
      setError('Ingresá un número válido.')
      return
    }

    iniciarGuardado(async () => {
      const resultado = await guardarPresupuesto(categoria.id, monto)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setError(null)
      setEditando(false)
      router.refresh()
    })
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-2.5">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: `${categoria.color}1F`, color: categoria.color }}
        >
          <IconoCategoria icono={categoria.icono} className="size-3.5" />
        </span>

        <span className="min-w-0 flex-1 truncate text-sm font-medium">{categoria.nombre}</span>

        {editando ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="100"
              value={valor}
              autoFocus
              placeholder="Sin límite"
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') guardar()
                if (e.key === 'Escape') setEditando(false)
              }}
              className="w-28 rounded-md border border-border bg-card px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              aria-label="Guardar presupuesto"
              className="grid size-7 place-items-center rounded-md text-income hover:bg-primary/10 disabled:opacity-50"
            >
              {guardando ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Check className="size-4" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditando(false)
                setValor(categoria.presupuesto?.toString() ?? '')
                setError(null)
              }}
              disabled={guardando}
              aria-label="Cancelar"
              className="grid size-7 place-items-center rounded-md text-subtle hover:bg-foreground/5 disabled:opacity-50"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-muted transition hover:bg-foreground/5 hover:text-foreground"
          >
            {categoria.presupuesto === null ? (
              'Definir presupuesto'
            ) : (
              <span className="tabular-nums">
                {formatoMoneda.format(categoria.gastado)} / {formatoMoneda.format(presupuesto)}
              </span>
            )}
            <Pencil className="size-3" aria-hidden />
          </button>
        )}
      </div>

      {categoria.presupuesto !== null && (
        <>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
            role="progressbar"
            aria-valuenow={Math.round(porcentaje)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Presupuesto de ${categoria.nombre}`}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${estilos.barra}`}
              style={{ width: `${Math.min(porcentaje, 100)}%` }}
            />
          </div>

          <div className="flex items-baseline justify-between text-xs">
            <span className={`font-medium tabular-nums ${estilos.texto}`}>
              {porcentaje.toFixed(0)}% usado
            </span>
            <span className="tabular-nums text-subtle">
              {restante >= 0
                ? `Quedan ${formatoMoneda.format(restante)}`
                : `Excedido por ${formatoMoneda.format(Math.abs(restante))}`}
            </span>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-expense">
          {error}
        </p>
      )}
    </li>
  )
}

export function BudgetProgress({
  categorias,
  faltaMigracion,
}: {
  categorias: PresupuestoDeCategoria[]
  faltaMigracion: boolean
}) {
  // Primero las que tienen presupuesto, y dentro de esas las más comprometidas.
  const ordenadas = [...categorias].sort((a, b) => {
    if ((a.presupuesto === null) !== (b.presupuesto === null)) {
      return a.presupuesto === null ? 1 : -1
    }
    const avanceA = a.presupuesto ? a.gastado / a.presupuesto : 0
    const avanceB = b.presupuesto ? b.gastado / b.presupuesto : 0
    return avanceB - avanceA
  })

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Presupuestos del mes</h2>
        <span className="text-xs text-subtle">Tocá un monto para editarlo</span>
      </div>

      {faltaMigracion ? (
        <p className="rounded-lg border border-budget-warn/30 bg-budget-warn/10 px-3.5 py-2.5 text-xs text-budget-warn">
          Para usar presupuestos, ejecutá{' '}
          <code className="font-mono">migrations/001_add_monthly_budget.sql</code> en el SQL Editor
          de Supabase.
        </p>
      ) : ordenadas.length === 0 ? (
        <p className="py-6 text-center text-sm text-subtle">
          Todavía no tenés categorías de gasto.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {ordenadas.map((categoria) => (
            <FilaPresupuesto key={categoria.id} categoria={categoria} />
          ))}
        </ul>
      )}
    </section>
  )
}
