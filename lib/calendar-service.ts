import type { SupabaseClient } from '@supabase/supabase-js'
import type { Moneda, Tarjeta } from './types'

/**
 * Eventos del calendario financiero.
 *
 * Los cuatro tipos tienen su color en la grilla: cierre en oro, vencimiento en
 * rojo, ingreso en verde y cuota en ámbar.
 */
export type TipoDeEvento = 'cierre' | 'vencimiento' | 'ingreso' | 'cuota'

export type EventoFinanciero = {
  /** YYYY-MM-DD */
  fecha: string
  tipo: TipoDeEvento
  etiqueta: string
  detalle: string | null
  monto: number | null
  moneda: Moneda | null
}

export const COLOR_DE_EVENTO: Record<TipoDeEvento, string> = {
  cierre: 'bg-gold-leaf',
  vencimiento: 'bg-error-rose',
  ingreso: 'bg-success-emerald',
  cuota: 'bg-budget-warn',
}

export const ETIQUETA_DE_EVENTO: Record<TipoDeEvento, string> = {
  cierre: 'Cierre de tarjeta',
  vencimiento: 'Vencimiento de resumen',
  ingreso: 'Ingreso',
  cuota: 'Cuota',
}

/** Cantidad de días de un mes (mes 1-12). */
export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

/** Día de la semana del 1 del mes, con lunes = 0 (así arranca la grilla). */
export function offsetDelPrimerDia(anio: number, mes: number): number {
  const domingoCero = new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay()
  return (domingoCero + 6) % 7
}

function fecha(anio: number, mes: number, dia: number): string {
  const real = Math.min(dia, diasDelMes(anio, mes))
  return `${anio}-${String(mes).padStart(2, '0')}-${String(real).padStart(2, '0')}`
}

/** Mes siguiente a (anio, mes), en base 1. */
function mesSiguiente(anio: number, mes: number): [number, number] {
  return mes === 12 ? [anio + 1, 1] : [anio, mes + 1]
}

/**
 * Fechas de cierre y vencimiento que caen dentro de un mes dado.
 *
 * El vencimiento de un resumen que cierra el día C se paga el día D: si D es
 * anterior o igual a C, ese pago cae recién en el mes siguiente. Por eso el
 * vencimiento visible en un mes puede corresponder al cierre del mes anterior.
 *
 * Función pura para poder verificarla sin base de datos.
 */
export function eventosDeTarjetas(
  tarjetas: Tarjeta[],
  anio: number,
  mes: number
): EventoFinanciero[] {
  const eventos: EventoFinanciero[] = []

  for (const tarjeta of tarjetas) {
    const { closing_day: cierre, due_day: vence } = tarjeta.detalle
    if (!cierre || !vence) continue

    eventos.push({
      fecha: fecha(anio, mes, cierre),
      tipo: 'cierre',
      etiqueta: tarjeta.name,
      detalle: 'Cierra el resumen',
      monto: null,
      moneda: null,
    })

    // El pago del resumen que cierra este mes, o el mes que viene si el día de
    // vencimiento ya pasó al momento del cierre.
    const [anioPago, mesPago] = vence > cierre ? [anio, mes] : mesSiguiente(anio, mes)

    eventos.push({
      fecha: fecha(anioPago, mesPago, vence),
      tipo: 'vencimiento',
      etiqueta: tarjeta.name,
      detalle: 'Vence el pago del resumen',
      monto: Math.max(0, -Number(tarjeta.balance ?? 0)) || null,
      moneda: (tarjeta.currency === 'USD' ? 'USD' : 'ARS') as Moneda,
    })
  }

  // Los vencimientos empujados al mes siguiente se descartan de esta vista.
  const prefijo = `${anio}-${String(mes).padStart(2, '0')}`
  return eventos.filter((e) => e.fecha.startsWith(prefijo))
}

type MovimientoDeCalendario = {
  date: string
  amount: number
  currency: string | null
  type: string
  description: string | null
  installment_current: number | null
  installment_total: number | null
}

/** Ingresos y cuotas del mes, como eventos de la grilla. */
export function eventosDeMovimientos(
  movimientos: MovimientoDeCalendario[]
): EventoFinanciero[] {
  const eventos: EventoFinanciero[] = []

  for (const movimiento of movimientos) {
    const moneda = (movimiento.currency === 'USD' ? 'USD' : 'ARS') as Moneda

    if (movimiento.type === 'INCOME') {
      eventos.push({
        fecha: movimiento.date,
        tipo: 'ingreso',
        etiqueta: movimiento.description ?? 'Ingreso',
        detalle: null,
        monto: Number(movimiento.amount),
        moneda,
      })
      continue
    }

    if (movimiento.installment_total && movimiento.installment_total > 1) {
      eventos.push({
        fecha: movimiento.date,
        tipo: 'cuota',
        etiqueta: movimiento.description ?? 'Cuota',
        detalle: `Cuota ${movimiento.installment_current ?? 1} de ${movimiento.installment_total}`,
        monto: Number(movimiento.amount),
        moneda,
      })
    }
  }

  return eventos
}

/** Agrupa los eventos por día del mes, para pintarlos en la grilla. */
export function agruparPorDia(eventos: EventoFinanciero[]): Map<number, EventoFinanciero[]> {
  const porDia = new Map<number, EventoFinanciero[]>()

  for (const evento of eventos) {
    const dia = Number(evento.fecha.slice(8, 10))
    if (!Number.isFinite(dia)) continue
    if (!porDia.has(dia)) porDia.set(dia, [])
    porDia.get(dia)!.push(evento)
  }

  return porDia
}

/**
 * Carga todos los eventos financieros de un mes.
 *
 * Solo se consultan los movimientos del mes pedido: la grilla nunca muestra
 * más de un mes por vez.
 */
export async function cargarEventosDelMes(
  supabase: SupabaseClient,
  tarjetas: Tarjeta[],
  anio: number,
  mes: number
): Promise<{ eventos: EventoFinanciero[]; error: string | null }> {
  const desde = fecha(anio, mes, 1)
  const hasta = fecha(anio, mes, 31)

  // Sin las columnas de migrations/004 la query sigue siendo válida: las de
  // cuotas son de migrations/003, que ya existe.
  const { data, error } = await supabase
    .from('transactions')
    .select('date, amount, currency, type, description, installment_current, installment_total')
    .gte('date', desde)
    .lte('date', hasta)

  const movimientos = (data ?? []) as MovimientoDeCalendario[]

  return {
    eventos: [
      ...eventosDeTarjetas(tarjetas, anio, mes),
      ...eventosDeMovimientos(movimientos),
    ].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    error: error?.message ?? null,
  }
}
