import type { Moneda, Tarjeta } from './types'

export type Recomendacion = {
  tarjeta: Tarjeta
  /** Días desde hoy hasta que vence el pago de esta compra. */
  diasDeFinanciacion: number
  /** Fecha en que cierra el resumen donde caería la compra (YYYY-MM-DD). */
  fechaDeCierre: string
  /** Fecha en que hay que pagarla (YYYY-MM-DD). */
  fechaDeVencimiento: string
  /** Días desde que cerró el último resumen. 0 = cerró hoy. */
  diasDesdeElCierre: number
  motivo: string
}

const MS_POR_DIA = 86_400_000

/** Un día del mes acotado a los días reales de ese mes (31 en febrero → 28). */
function diaValido(anio: number, mes: number, dia: number): Date {
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()
  return new Date(Date.UTC(anio, mes, Math.min(dia, ultimoDia)))
}

function aISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / MS_POR_DIA)
}

/**
 * Calcula cuánto se financia una compra hecha hoy con esta tarjeta.
 *
 * La compra entra en el resumen que todavía no cerró. Si ya pasó el día de
 * cierre de este mes, cae en el del mes que viene. El vencimiento es el
 * `due_day` posterior a ese cierre.
 */
export function calcularFinanciacion(
  detalle: { closing_day: number; due_day: number },
  hoy: Date
): {
  fechaDeCierre: Date
  fechaDeVencimiento: Date
  diasDeFinanciacion: number
  diasDesdeElCierre: number
} {
  const anio = hoy.getUTCFullYear()
  const mes = hoy.getUTCMonth()

  const cierreDeEsteMes = diaValido(anio, mes, detalle.closing_day)

  // Si hoy ya es el día de cierre o posterior, la compra va al resumen siguiente.
  const cierre =
    hoy.getTime() >= cierreDeEsteMes.getTime()
      ? diaValido(anio, mes + 1, detalle.closing_day)
      : cierreDeEsteMes

  // El vencimiento cae después del cierre: si el due_day es menor o igual al
  // closing_day, corresponde al mes siguiente al del cierre.
  const mesDelCierre = cierre.getUTCMonth()
  const anioDelCierre = cierre.getUTCFullYear()
  const vencimientoMismoMes = diaValido(anioDelCierre, mesDelCierre, detalle.due_day)
  const vencimiento =
    vencimientoMismoMes.getTime() > cierre.getTime()
      ? vencimientoMismoMes
      : diaValido(anioDelCierre, mesDelCierre + 1, detalle.due_day)

  // Hace cuánto cerró el último resumen (el anterior al que está abierto).
  const cierreAnterior =
    hoy.getTime() >= cierreDeEsteMes.getTime()
      ? cierreDeEsteMes
      : diaValido(anio, mes - 1, detalle.closing_day)

  return {
    fechaDeCierre: cierre,
    fechaDeVencimiento: vencimiento,
    diasDeFinanciacion: diasEntre(hoy, vencimiento),
    diasDesdeElCierre: diasEntre(cierreAnterior, hoy),
  }
}

/**
 * Elige con qué tarjeta conviene pagar.
 *
 * Gana la que más días de financiación ofrezca, que es la que cerró más
 * recientemente: la compra entra al principio de un resumen nuevo y se paga
 * lo más tarde posible.
 *
 * Devuelve null si no hay tarjetas en esa moneda o si ninguna tiene cupo.
 */
export function getBestCardToPay(
  tarjetas: Tarjeta[],
  amount: number,
  currency: Moneda,
  /** Deuda actual por tarjeta (positiva), para descartar las sin cupo. */
  deudaPorTarjeta: Map<string, number> = new Map(),
  date: Date = new Date()
): Recomendacion | null {
  // Normalizamos a medianoche UTC: solo importan los días, no la hora.
  const hoy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

  const candidatas = tarjetas
    .filter((tarjeta) => tarjeta.currency === currency)
    .filter((tarjeta) => {
      const limite = tarjeta.detalle.credit_limit
      if (limite === null || limite === undefined) return true
      const usado = deudaPorTarjeta.get(tarjeta.id) ?? 0
      return usado + amount <= Number(limite)
    })
    .map((tarjeta) => {
      const calculo = calcularFinanciacion(tarjeta.detalle, hoy)
      return {
        tarjeta,
        diasDeFinanciacion: calculo.diasDeFinanciacion,
        diasDesdeElCierre: calculo.diasDesdeElCierre,
        fechaDeCierre: aISO(calculo.fechaDeCierre),
        fechaDeVencimiento: aISO(calculo.fechaDeVencimiento),
        motivo: '',
      }
    })

  if (candidatas.length === 0) return null

  candidatas.sort((a, b) => b.diasDeFinanciacion - a.diasDeFinanciacion)
  const mejor = candidatas[0]

  return { ...mejor, motivo: describirCierre(mejor.diasDesdeElCierre) }
}

function describirCierre(diasDesdeElCierre: number): string {
  if (diasDesdeElCierre === 0) return 'Cerró hoy'
  if (diasDesdeElCierre === 1) return 'Cerró ayer'
  return `Cerró hace ${diasDesdeElCierre} días`
}
