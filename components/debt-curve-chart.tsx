'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { PuntoDeCurva } from '@/lib/commitments-service'
import { formatearMonto, type Moneda } from '@/lib/types'

const MONEDAS: Moneda[] = ['ARS', 'USD']

/**
 * Curva de desendeudamiento: cuánto hay que pagar en cuotas cada mes.
 *
 * Un gráfico por moneda, igual que el resto de la app: sumar pesos con
 * dólares en una misma barra no significaría nada.
 */
export function DebtCurveChart({ curva }: { curva: PuntoDeCurva[] }) {
  const [moneda, setMoneda] = useState<Moneda>('ARS')

  const datos = useMemo(
    () =>
      curva.map((punto) => ({
        etiqueta: punto.etiqueta,
        valor: punto.porMoneda.find((m) => m.moneda === moneda)?.valor ?? 0,
      })),
    [curva, moneda]
  )

  const maximo = Math.max(...datos.map((d) => d.valor), 0)
  const hayDatos = maximo > 0

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Curva de desendeudamiento</h2>
          <p className="mt-0.5 text-xs text-subtle">Cuotas a pagar en los próximos 12 meses</p>
        </div>

        <div
          role="group"
          aria-label="Moneda de la curva"
          className="flex rounded-lg border border-border p-0.5"
        >
          {MONEDAS.map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => setMoneda(opcion)}
              aria-pressed={moneda === opcion}
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition ${
                moneda === opcion
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-subtle hover:text-foreground'
              }`}
            >
              {opcion}
            </button>
          ))}
        </div>
      </div>

      {!hayDatos ? (
        <p className="py-10 text-center text-sm text-subtle">
          No tenés cuotas pendientes en {moneda}.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={datos} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="etiqueta"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: 'var(--subtle)' }}
              interval={0}
            />
            <Tooltip
              cursor={{ fill: 'var(--border)' }}
              formatter={(valor) => [formatearMonto(Number(valor), moneda), 'A pagar']}
              contentStyle={{
                borderRadius: 10,
                border: '1px solid var(--border-strong)',
                background: 'var(--card)',
                fontSize: 13,
                color: 'var(--foreground)',
              }}
            />
            <Bar dataKey="valor" radius={[4, 4, 0, 0]} animationDuration={500}>
              {datos.map((punto, indice) => (
                // El degradado hacia el final refuerza la idea de desendeudarse.
                <Cell
                  key={punto.etiqueta}
                  fill="var(--wealth)"
                  fillOpacity={0.35 + (0.65 * (datos.length - indice)) / datos.length}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  )
}
