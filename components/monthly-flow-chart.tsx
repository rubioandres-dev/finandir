'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { useFormatoRegional, useTraduccion } from '@/components/currency-provider'
import type { PuntoMensual } from '@/lib/monthly-flow'
import type { Moneda } from '@/lib/types'

/**
 * Ingresos contra gastos de los últimos doce meses.
 *
 * DOS BARRAS Y NO UNA DE NETO
 *
 * El neto de un mes esconde la escala: −$50.000 se ve igual ganando 100 y
 * gastando 150 que ganando 2.000.000 y gastando 2.050.000, y son dos
 * situaciones distintas. Las dos barras enfrentadas muestran el tamaño real de
 * los dos flujos, que es lo que deja ver si el mes fue apretado o sobrado.
 *
 * SIN EJE Y
 *
 * Los importes van en el tooltip. Un eje de valores en pesos argentinos son
 * siete dígitos por marca, y en la columna angosta del desktop se comían la
 * mitad del ancho útil para decir algo que ya dice la altura relativa.
 */
export function MonthlyFlowChart({
  serie,
  moneda,
}: {
  serie: PuntoMensual[]
  moneda: Moneda
}) {
  const { formatearMonto, formatearMesCorto } = useFormatoRegional()
  const { t } = useTraduccion()

  const hayDatos = serie.some((punto) => punto.ingresos > 0 || punto.gastos > 0)

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
          {t('evolutivo.titulo')}
        </h2>
        <span className="shrink-0 text-[10px] text-subtle">
          {t('comun.enMoneda', { moneda })}
        </span>
      </div>

      {!hayDatos ? (
        <p className="py-10 text-center text-sm text-subtle">
          {t('evolutivo.sinDatos', { moneda })}
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={serie} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid
                vertical={false}
                stroke="var(--glass-stroke)"
                strokeOpacity={0.35}
              />

              <XAxis
                dataKey="mes"
                tickFormatter={(mes: string) => formatearMesCorto(mes)}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                tick={{ fill: 'var(--subtle)', fontSize: 10 }}
              />

              <Tooltip
                cursor={{ fill: 'var(--gold-leaf)', fillOpacity: 0.06 }}
                labelFormatter={(mes) => formatearMesCorto(String(mes))}
                // Sin anotar los parámetros: recharts los tipa como
                // `ValueType | undefined` y una firma explícita no encaja.
                formatter={(valor, nombre) => [
                  formatearMonto(Number(valor), moneda),
                  nombre === 'ingresos' ? t('dashboard.ingresos') : t('dashboard.gastos'),
                ]}
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid var(--border-strong)',
                  background: 'var(--card)',
                  fontSize: 12,
                  color: 'var(--foreground)',
                }}
              />

              <Bar dataKey="ingresos" fill="var(--income)" radius={[3, 3, 0, 0]} maxBarSize={14} />
              <Bar dataKey="gastos" fill="var(--expense)" radius={[3, 3, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>

          {/* Leyenda propia: la de recharts no respeta la tipografía AUREM y
              agrega una fila de alto fijo que descuadra la card. */}
          <ul className="flex items-center justify-center gap-4">
            <li className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
              <span className="size-2 rounded-full bg-income" aria-hidden />
              {t('dashboard.ingresos')}
            </li>
            <li className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
              <span className="size-2 rounded-full bg-expense" aria-hidden />
              {t('dashboard.gastos')}
            </li>
          </ul>
        </>
      )}
    </section>
  )
}
