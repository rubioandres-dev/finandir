'use client'

import { useMemo, useState } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { agruparGastosPorCategoria, type GastoParaGrafico } from '@/lib/analytics'
import { ETIQUETA_PERIODO, formatearMonto, type Moneda, type Periodo } from '@/lib/types'

const PERIODOS: Periodo[] = ['mes', 'mesAnterior', 'anio']
const MONEDAS: Moneda[] = ['ARS', 'USD']

export type { GastoParaGrafico }

type Props = {
  /** Solo movimientos de tipo EXPENSE; el filtrado por período es en cliente. */
  gastos: GastoParaGrafico[]
  categorias: { id: string; name: string; color: string }[]
}

export function AnalyticsChart({ gastos, categorias }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  // Un gráfico por moneda: una torta que mezcle pesos y dólares no significa nada.
  const [moneda, setMoneda] = useState<Moneda>('ARS')

  const { porciones, total } = useMemo(
    () => agruparGastosPorCategoria(gastos, categorias, periodo, moneda),
    [gastos, categorias, periodo, moneda]
  )

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">Gastos por categoría</h2>
          <div role="group" aria-label="Moneda del gráfico" className="flex rounded-lg border border-border p-0.5">
            {MONEDAS.map((opcion) => (
              <button
                key={opcion}
                type="button"
                onClick={() => setMoneda(opcion)}
                aria-pressed={moneda === opcion}
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition ${
                  moneda === opcion ? 'bg-foreground/10 text-foreground' : 'text-subtle hover:text-foreground'
                }`}
              >
                {opcion}
              </button>
            ))}
          </div>
        </div>

        <div
          role="group"
          aria-label="Período del gráfico"
          className="flex rounded-lg border border-border p-0.5"
        >
          {PERIODOS.map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => setPeriodo(opcion)}
              aria-pressed={periodo === opcion}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                periodo === opcion
                  ? 'fire-gradient text-midnight-navy'
                  : 'text-muted hover:text-gold-leaf'
              }`}
            >
              {ETIQUETA_PERIODO[opcion]}
            </button>
          ))}
        </div>
      </div>

      {porciones.length === 0 ? (
        <p className="py-10 text-center text-sm text-subtle">
          No hay gastos en {moneda} en este período.
        </p>
      ) : (
        <>
          <div className="relative">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={porciones}
                  dataKey="total"
                  nameKey="nombre"
                  cx="50%"
                  cy="50%"
                  innerRadius="58%"
                  outerRadius="82%"
                  paddingAngle={2}
                  strokeWidth={0}
                  animationDuration={400}
                >
                  {porciones.map((porcion) => (
                    <Cell key={porcion.nombre} fill={porcion.color} />
                  ))}
                </Pie>

                <Tooltip
                  // Sin anotar los parámetros: recharts los tipa como
                  // `ValueType | undefined` y una firma explícita no encaja.
                  formatter={(valor) => formatearMonto(Number(valor), moneda)}
                  contentStyle={{
                    borderRadius: 10,
                    border: '1px solid var(--border-strong)',
                    background: 'var(--card)',
                    fontSize: 13,
                    color: 'var(--foreground)',
                  }}
                />

                <Legend
                  verticalAlign="bottom"
                  height={1}
                  content={() => null}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Total al centro de la dona. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[11px] uppercase tracking-wide text-subtle">
                Total
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {formatearMonto(total, moneda)}
              </span>
            </div>
          </div>

          {/* Leyenda propia: en mobile la de recharts se corta y no muestra montos. */}
          <ul className="flex flex-col gap-1.5">
            {porciones.map((porcion) => (
              <li key={porcion.nombre} className="flex items-center gap-2.5 text-sm">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: porcion.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{porcion.nombre}</span>
                <span className="shrink-0 text-xs tabular-nums text-subtle">
                  {porcion.porcentaje.toFixed(1)}%
                </span>
                <span className="shrink-0 tabular-nums font-medium">
                  {formatearMonto(porcion.total, moneda)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
