'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Loader2, Plus, X } from 'lucide-react'
import { guardarPresupuesto } from '@/app/dashboard/actions'
import { IconoCategoria } from '@/lib/category-icons'
import { formatearMonto, type Moneda } from '@/lib/types'

const MONEDAS: Moneda[] = ['ARS', 'USD']

export type LineaDePresupuesto = {
  moneda: Moneda
  /** null = sin presupuesto definido en esa moneda. */
  presupuesto: number | null
  gastado: number
}

export type PresupuestoDeCategoria = {
  id: string
  nombre: string
  icono: string
  color: string
  lineas: LineaDePresupuesto[]
}

/**
 * Bandas de color: verde <75%, ámbar 75-100%, rojo al superarlo. El pedido
 * original dejaba sin definir el tramo 95-100%, así que el ámbar llega hasta
 * el 100% para no dejar un hueco.
 */
function estilosSegunAvance(porcentaje: number) {
  if (porcentaje >= 100) return { barra: 'bg-budget-over', texto: 'text-expense' }
  if (porcentaje >= 75) return { barra: 'bg-budget-warn', texto: 'text-budget-warn' }
  return { barra: 'bg-budget-ok', texto: 'text-income' }
}

function LineaMoneda({
  categoriaId,
  nombreCategoria,
  linea,
}: {
  categoriaId: string
  nombreCategoria: string
  linea: LineaDePresupuesto
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(linea.presupuesto?.toString() ?? '')
  const [guardando, iniciarGuardado] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const presupuesto = linea.presupuesto ?? 0
  const porcentaje = presupuesto > 0 ? (linea.gastado / presupuesto) * 100 : 0
  const estilos = estilosSegunAvance(porcentaje)
  const restante = presupuesto - linea.gastado

  function guardar() {
    const limpio = valor.trim()
    const monto = limpio === '' ? null : Number(limpio.replace(',', '.'))

    if (monto !== null && (!Number.isFinite(monto) || monto < 0)) {
      setError('Ingresá un número válido.')
      return
    }

    iniciarGuardado(async () => {
      const resultado = await guardarPresupuesto(categoriaId, linea.moneda, monto)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setError(null)
      setEditando(false)
      router.refresh()
    })
  }

  // Sin presupuesto ni gasto en esta moneda: no ocupamos espacio con una barra.
  if (linea.presupuesto === null && linea.gastado === 0 && !editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="flex items-center gap-1.5 self-start rounded-md px-1 py-0.5 text-[11px] text-subtle transition hover:bg-foreground/5 hover:text-foreground"
      >
        <Plus className="size-3" aria-hidden />
        Presupuesto en {linea.moneda}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-subtle">
          {linea.moneda}
        </span>

        {editando ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step={linea.moneda === 'USD' ? '10' : '1000'}
              value={valor}
              autoFocus
              placeholder="Sin límite"
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') guardar()
                if (e.key === 'Escape') setEditando(false)
              }}
              className="w-28 rounded-md border border-border bg-card px-2 py-1 text-right text-sm tabular-nums text-foreground outline-none focus:border-primary"
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
                setValor(linea.presupuesto?.toString() ?? '')
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
            className="flex flex-1 items-baseline justify-between gap-2 rounded-md px-1 py-0.5 text-xs transition hover:bg-foreground/5"
          >
            <span className="tabular-nums text-muted">
              {formatearMonto(linea.gastado, linea.moneda)}
              {linea.presupuesto !== null && (
                <> / {formatearMonto(linea.presupuesto, linea.moneda)}</>
              )}
            </span>
            {linea.presupuesto === null ? (
              <span className="text-subtle">Definir límite</span>
            ) : (
              <span className={`font-medium tabular-nums ${estilos.texto}`}>
                {porcentaje.toFixed(0)}%
              </span>
            )}
          </button>
        )}
      </div>

      {linea.presupuesto !== null && !editando && (
        <>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
            role="progressbar"
            aria-valuenow={Math.round(porcentaje)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Presupuesto de ${nombreCategoria} en ${linea.moneda}`}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${estilos.barra}`}
              style={{ width: `${Math.min(porcentaje, 100)}%` }}
            />
          </div>
          <p className="text-[11px] tabular-nums text-subtle">
            {restante >= 0
              ? `Quedan ${formatearMonto(restante, linea.moneda)}`
              : `Excedido por ${formatearMonto(Math.abs(restante), linea.moneda)}`}
          </p>
        </>
      )}

      {error && (
        <p role="alert" className="text-[11px] text-expense">
          {error}
        </p>
      )}
    </div>
  )
}

export function BudgetProgress({
  categorias,
  faltaMigracion,
}: {
  categorias: PresupuestoDeCategoria[]
  faltaMigracion: boolean
}) {
  const avanceMaximo = (c: PresupuestoDeCategoria) =>
    Math.max(
      0,
      ...c.lineas.map((l) => (l.presupuesto && l.presupuesto > 0 ? l.gastado / l.presupuesto : 0))
    )

  // Primero las que tienen algún límite, y dentro de esas las más
  // comprometidas en cualquiera de las dos monedas.
  const ordenadas = [...categorias].sort((a, b) => {
    const aTiene = a.lineas.some((l) => l.presupuesto !== null)
    const bTiene = b.lineas.some((l) => l.presupuesto !== null)
    if (aTiene !== bTiene) return aTiene ? -1 : 1
    return avanceMaximo(b) - avanceMaximo(a)
  })

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Presupuestos del mes</h2>
        <span className="text-xs text-subtle">Un límite por moneda</span>
      </div>

      {faltaMigracion ? (
        <p className="rounded-xl border border-budget-warn/30 bg-budget-warn/10 px-3.5 py-2.5 text-xs text-budget-warn">
          Para usar presupuestos, ejecutá{' '}
          <code className="font-mono">migrations/002_multi_moneda.sql</code> en el SQL Editor de
          Supabase.
        </p>
      ) : ordenadas.length === 0 ? (
        <p className="py-6 text-center text-sm text-subtle">Todavía no tenés categorías de gasto.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {ordenadas.map((categoria) => (
            <li key={categoria.id} className="flex flex-col gap-2 py-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-full"
                  style={{ backgroundColor: `${categoria.color}1F`, color: categoria.color }}
                >
                  <IconoCategoria icono={categoria.icono} className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight">
                  {categoria.nombre}
                </span>
              </div>

              <div className="flex flex-col gap-2 pl-9">
                {MONEDAS.map((moneda) => (
                  <LineaMoneda
                    key={moneda}
                    categoriaId={categoria.id}
                    nombreCategoria={categoria.nombre}
                    linea={
                      categoria.lineas.find((l) => l.moneda === moneda) ?? {
                        moneda,
                        presupuesto: null,
                        gastado: 0,
                      }
                    }
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
