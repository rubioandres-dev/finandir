'use client'

import { TrendingDown, TrendingUp } from 'lucide-react'
import { useFormatoRegional, useTraduccion } from '@/components/currency-provider'
import { Card, CardLabel } from '@/components/ui/card'
import type { Moneda } from '@/lib/types'

/**
 * Ingresos y gastos del mes, en la moneda activa.
 *
 * POR QUÉ LAS DOS CARDS SON UN SOLO COMPONENTE
 *
 * Porque el tamaño de letra de una depende de la otra. Si cada card eligiera
 * su tipografía por su cuenta, "$ 98.416,66" saldría grande al lado de
 * "$ 1.500.000,00" chiquito, y la comparación visual —que es para lo que están
 * una al lado de la otra— quedaría mintiendo: la cifra menor se vería más
 * imponente. El escalado se decide con el más largo de los dos y se aplica a
 * ambos.
 */

/**
 * Tipografía según el largo de la parte entera más grande de las dos.
 *
 * Los cortes salen del ancho real: en una card a media pantalla de 360 px
 * entran cómodos unos 8 caracteres a `text-2xl`. De ahí en adelante hay que
 * bajar, y a partir de 12 —cifras de billón, o de millón con centavos en un
 * locale que agrupa de a tres— hay que bajar otra vez.
 */
function escalaPara(largo: number): { monto: string; decimales: string } {
  if (largo <= 8) return { monto: 'text-xl sm:text-2xl', decimales: 'text-xs sm:text-sm' }
  if (largo <= 12) return { monto: 'text-lg sm:text-xl', decimales: 'text-[10px] sm:text-xs' }
  return { monto: 'text-base sm:text-lg', decimales: 'text-[9px] sm:text-[10px]' }
}

function Flujo({
  etiqueta,
  Icono,
  color,
  valor,
  moneda,
  escala,
  vacio,
  subtitulo,
}: {
  etiqueta: string
  Icono: typeof TrendingUp
  color: string
  valor: number
  moneda: Moneda
  escala: { monto: string; decimales: string }
  vacio: string
  subtitulo: string
}) {
  const { partesDeMonto } = useFormatoRegional()
  const partes = partesDeMonto(valor, moneda)

  return (
    <Card glass className="flex min-w-0 flex-col justify-between p-4">
      <CardLabel>
        <Icono className={`size-3.5 shrink-0 ${color}`} aria-hidden />
        {etiqueta}
      </CardLabel>

      <div className="mt-2 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">{moneda}</p>

        {valor === 0 ? (
          <p className={`${escala.monto} font-bold tracking-tight ${color}`}>{vacio}</p>
        ) : (
          // `title` con el importe entero: los decimales elevados se leen bien
          // pero son chicos, y en una lectura de pantalla conviene el completo.
          <div
            title={partes.fullFormatted}
            className="flex min-w-0 flex-wrap items-baseline"
            aria-label={partes.fullFormatted}
          >
            <span
              aria-hidden
              className={`${escala.monto} font-bold leading-tight tracking-tight tabular-nums ${color}`}
            >
              {partes.symbol} {partes.integerPart}
            </span>
            {partes.decimalPart && (
              <span
                aria-hidden
                className={`${escala.decimales} ml-0.5 -translate-y-1 align-super font-semibold tabular-nums text-on-surface-variant`}
              >
                {partes.decimalPart}
              </span>
            )}
          </div>
        )}
      </div>

      <p className="mt-1.5 text-[11px] text-subtle">{subtitulo}</p>
    </Card>
  )
}

export function FlowCards({
  ingresos,
  gastos,
  moneda,
}: {
  ingresos: number
  gastos: number
  moneda: Moneda
}) {
  const { t } = useTraduccion()
  const { partesDeMonto } = useFormatoRegional()

  // El escalado se decide UNA vez, con el más largo de los dos.
  const largoMaximo = Math.max(
    partesDeMonto(ingresos, moneda).integerPart.length,
    partesDeMonto(gastos, moneda).integerPart.length
  )
  const escala = escalaPara(largoMaximo)

  return (
    <>
      <Flujo
        etiqueta={t('dashboard.ingresos')}
        Icono={TrendingUp}
        color="text-success-emerald"
        valor={ingresos}
        moneda={moneda}
        escala={escala}
        vacio="—"
        subtitulo={t('dashboard.esteMes')}
      />
      <Flujo
        etiqueta={t('dashboard.gastos')}
        Icono={TrendingDown}
        color="text-error-rose"
        valor={gastos}
        moneda={moneda}
        escala={escala}
        vacio="—"
        subtitulo={t('dashboard.esteMes')}
      />
    </>
  )
}
