'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  COLOR_DE_EVENTO,
  ETIQUETA_DE_EVENTO,
  agruparPorDia,
  diasDelMes,
  offsetDelPrimerDia,
  type EventoFinanciero,
  type TipoDeEvento,
} from '@/lib/calendar-service'
import { formatearMonto } from '@/lib/types'

const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

const ORDEN_DE_TIPOS: TipoDeEvento[] = ['cierre', 'vencimiento', 'ingreso', 'cuota']

/**
 * `timeZone: 'UTC'` obligatorio: el Date se arma con `Date.UTC` en el día 1, y
 * al formatearlo en la zona local (UTC−3) esa medianoche cae en el día
 * anterior, o sea en el mes anterior. El encabezado del calendario mostraba un
 * mes menos que el que estaba dibujando. Ver la nota en `formatearFecha`.
 */
function nombreDelMes(anio: number, mes: number): string {
  return new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(anio, mes - 1, 1)))
}

/** "2026-08" del mes anterior o siguiente. */
function periodoVecino(anio: number, mes: number, salto: number): string {
  const destino = new Date(Date.UTC(anio, mes - 1 + salto, 1))
  return `${destino.getUTCFullYear()}-${String(destino.getUTCMonth() + 1).padStart(2, '0')}`
}

export function FinancialCalendar({
  anio,
  mes,
  hoy,
  eventos,
}: {
  anio: number
  mes: number
  /** YYYY-MM-DD en hora de Argentina, para marcar el día de hoy. */
  hoy: string
  eventos: EventoFinanciero[]
}) {
  const porDia = useMemo(() => agruparPorDia(eventos), [eventos])
  const total = diasDelMes(anio, mes)
  const offset = offsetDelPrimerDia(anio, mes)

  const [anioHoy, mesHoy, diaHoy] = hoy.split('-').map(Number)
  const esMesActual = anioHoy === anio && mesHoy === mes

  // Arranca en el día de hoy si estamos en el mes en curso; si no, sin selección.
  const [seleccionado, setSeleccionado] = useState<number | null>(esMesActual ? diaHoy : null)

  const delDia = seleccionado ? (porDia.get(seleccionado) ?? []) : []

  // Las celdas vacías del principio alinean el 1 con su día de la semana.
  const celdas: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* --- Cabecera del mes ---------------------------------------------- */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/dashboard/calendar?m=${periodoVecino(anio, mes, -1)}`}
          aria-label="Mes anterior"
          className="grid size-9 place-items-center rounded-xl border border-glass-stroke/60 text-on-surface-variant transition active:scale-90 hover:border-gold-leaf/60 hover:text-gold-leaf"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Link>

        <p className="font-display text-base font-bold capitalize tracking-tight text-on-background">
          {nombreDelMes(anio, mes)}
        </p>

        <Link
          href={`/dashboard/calendar?m=${periodoVecino(anio, mes, 1)}`}
          aria-label="Mes siguiente"
          className="grid size-9 place-items-center rounded-xl border border-glass-stroke/60 text-on-surface-variant transition active:scale-90 hover:border-gold-leaf/60 hover:text-gold-leaf"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>

      {/* --- Grilla --------------------------------------------------------- */}
      <div className="glass-card rounded-2xl p-3">
        <div className="grid grid-cols-7 gap-1">
          {DIAS.map((dia) => (
            <div
              key={dia}
              className="aurem-caps pb-1.5 text-center text-[9px] text-on-surface-variant/60"
            >
              {dia}
            </div>
          ))}

          {celdas.map((dia, indice) => {
            if (dia === null) return <div key={`vacio-${indice}`} aria-hidden />

            const eventosDelDia = porDia.get(dia) ?? []
            const esHoy = esMesActual && dia === diaHoy
            const estaSeleccionado = dia === seleccionado

            // Un punto por tipo presente, no uno por evento: con cinco cuotas
            // el mismo día la celda se volvería ilegible.
            const tipos = ORDEN_DE_TIPOS.filter((tipo) =>
              eventosDelDia.some((e) => e.tipo === tipo)
            )

            return (
              <button
                key={dia}
                type="button"
                onClick={() => setSeleccionado(estaSeleccionado ? null : dia)}
                aria-pressed={estaSeleccionado}
                aria-label={
                  eventosDelDia.length === 0
                    ? `${dia}, sin eventos`
                    : `${dia}, ${eventosDelDia.length} evento${eventosDelDia.length === 1 ? '' : 's'}`
                }
                className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border text-xs tabular-nums transition active:scale-90 ${
                  estaSeleccionado
                    ? 'border-gold-leaf bg-gold-leaf/15 font-bold text-gold-leaf'
                    : esHoy
                      ? 'border-gold-leaf/40 text-on-background'
                      : 'border-transparent text-on-surface-variant/80 hover:bg-gold-leaf/[0.06]'
                }`}
              >
                {dia}
                <span className="flex h-1.5 items-center gap-0.5">
                  {tipos.map((tipo) => (
                    <span
                      key={tipo}
                      className={`size-1.5 rounded-full ${COLOR_DE_EVENTO[tipo]}`}
                      aria-hidden
                    />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* --- Referencia de colores ------------------------------------------ */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {ORDEN_DE_TIPOS.map((tipo) => (
          <li key={tipo} className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
            <span className={`size-1.5 rounded-full ${COLOR_DE_EVENTO[tipo]}`} aria-hidden />
            {ETIQUETA_DE_EVENTO[tipo]}
          </li>
        ))}
      </ul>

      {/* --- Detalle del día elegido ---------------------------------------- */}
      {seleccionado !== null && (
        <section className="flex flex-col gap-2">
          <h2 className="aurem-caps text-[10px] text-on-surface-variant/75">
            {seleccionado} de {nombreDelMes(anio, mes).split(' ')[0]}
          </h2>

          {delDia.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-glass-stroke/50 px-4 py-8 text-center text-sm text-subtle">
              No hay nada agendado este día.
            </p>
          ) : (
            <ul className="divide-y divide-glass-stroke/25 overflow-hidden rounded-2xl border border-glass-stroke/50 bg-charcoal">
              {delDia.map((evento, indice) => (
                <li key={`${evento.tipo}-${indice}`} className="flex items-center gap-3 px-3.5 py-3">
                  <span
                    className={`size-2 shrink-0 rounded-full ${COLOR_DE_EVENTO[evento.tipo]}`}
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium tracking-tight">
                      {evento.etiqueta}
                    </span>
                    <span className="truncate text-[11px] text-subtle">
                      {evento.detalle ?? ETIQUETA_DE_EVENTO[evento.tipo]}
                    </span>
                  </div>
                  {evento.monto !== null && evento.moneda && (
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        evento.tipo === 'ingreso' ? 'text-success-emerald' : 'text-on-background'
                      }`}
                    >
                      {formatearMonto(evento.monto, evento.moneda)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
