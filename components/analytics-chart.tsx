'use client'

import { useMemo, useState } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { agruparGastosPorCategoria, type GastoParaGrafico } from '@/lib/analytics'
import { ETIQUETA_PERIODO, formatoMoneda, type Periodo } from '@/lib/types'

const PERIODOS: Periodo[] = ['mes', 'mesAnterior', 'anio']

export type { GastoParaGrafico }

type Props = {
  /** Solo movimientos de tipo EXPENSE; el filtrado por período es en cliente. */
  gastos: GastoParaGrafico[]
  categorias: { id: string; name: string; color: string }[]
}

export function AnalyticsChart({ gastos, categorias }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>('mes')

  const { porciones, total } = useMemo(
    () => agruparGastosPorCategoria(gastos, categorias, periodo),
    [gastos, categorias, periodo]
  )

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-black/8 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Gastos por categoría</h2>

        <div
          role="group"
          aria-label="Período del gráfico"
          className="flex rounded-lg border border-black/10 p-0.5 dark:border-white/12"
        >
          {PERIODOS.map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => setPeriodo(opcion)}
              aria-pressed={periodo === opcion}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                periodo === opcion
                  ? 'bg-emerald-600 text-white'
                  : 'text-black/55 hover:text-black dark:text-white/55 dark:hover:text-white'
              }`}
            >
              {ETIQUETA_PERIODO[opcion]}
            </button>
          ))}
        </div>
      </div>

      {porciones.length === 0 ? (
        <p className="py-10 text-center text-sm text-black/45 dark:text-white/45">
          No hay gastos registrados en este período.
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
                  formatter={(valor) => formatoMoneda.format(Number(valor))}
                  contentStyle={{
                    borderRadius: 10,
                    border: '1px solid rgba(120,120,120,0.25)',
                    background: 'rgba(255,255,255,0.96)',
                    fontSize: 13,
                    color: '#111',
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
              <span className="text-[11px] uppercase tracking-wide text-black/40 dark:text-white/40">
                Total
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {formatoMoneda.format(total)}
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
                <span className="shrink-0 text-xs tabular-nums text-black/45 dark:text-white/45">
                  {porcion.porcentaje.toFixed(1)}%
                </span>
                <span className="shrink-0 tabular-nums font-medium">
                  {formatoMoneda.format(porcion.total)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
