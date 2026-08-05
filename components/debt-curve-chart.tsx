'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { useModoMoneda } from '@/components/currency-provider'
import type { PuntoDeCurva } from '@/lib/commitments-service'
import { formatearMonto, type Moneda } from '@/lib/types'


/**
 * Curva de desendeudamiento: cuánto hay que pagar en cuotas cada mes.
 *
 * Un gráfico por moneda, igual que el resto de la app: sumar pesos con
 * dólares en una misma barra no significaría nada.
 */
export function DebtCurveChart({ curva }: { curva: PuntoDeCurva[] }) {
  const { monedasSeleccionadas, modo } = useModoMoneda()
  const [moneda, setMoneda] = useState<Moneda>(modo)

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
    <section className="glass-card flex flex-col gap-4 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-bold tracking-tight text-on-background">
            Curva de desendeudamiento
          </h2>
          <p className="mt-0.5 text-xs text-subtle">Cuotas a pagar en los próximos 12 meses</p>
        </div>

        <div
          role="group"
          aria-label="Moneda de la curva"
          className="flex rounded-lg border border-glass-stroke/60 p-0.5"
        >
          {monedasSeleccionadas.map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => setMoneda(opcion)}
              aria-pressed={moneda === opcion}
              className={`rounded-md px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest transition active:scale-90 ${
                moneda === opcion
                  ? 'fire-gradient text-midnight-navy'
                  : 'text-subtle hover:text-gold-leaf'
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
            <defs>
              {/* Barra AUREM: oro pleno arriba, apagándose hacia la base. */}
              <linearGradient id="aurem-barra" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f2ca4f" stopOpacity={1} />
                <stop offset="100%" stopColor="#d4af35" stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(212, 175, 53, 0.12)" />
            <XAxis
              dataKey="etiqueta"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: 'var(--subtle)' }}
              interval={0}
            />
            <Tooltip
              cursor={{ fill: 'rgba(242, 202, 79, 0.08)' }}
              formatter={(valor) => [formatearMonto(Number(valor), moneda), 'A pagar']}
              contentStyle={{
                borderRadius: 10,
                border: '1px solid var(--glass-stroke)',
                background: 'var(--charcoal)',
                fontSize: 13,
                color: 'var(--foreground)',
              }}
            />
            <Bar dataKey="valor" radius={[4, 4, 0, 0]} animationDuration={500}>
              {datos.map((punto, indice) => (
                // Se apagan hacia el final: refuerza la idea de desendeudarse.
                <Cell
                  key={punto.etiqueta}
                  fill="url(#aurem-barra)"
                  fillOpacity={0.45 + (0.55 * (datos.length - indice)) / datos.length}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  )
}
