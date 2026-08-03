import type { SupabaseClient } from '@supabase/supabase-js'
import { rangoDelMesActual, type Moneda, type Tarjeta } from './types'

/**
 * Nivel AUREM del mes, derivado de la tasa de ahorro real: lo que quedó sin
 * gastar sobre lo que entró. No es un dato inventado ni una configuración: se
 * recalcula con cada movimiento.
 */
export type NivelAurem = {
  nombre: string
  /** 0–1: avance dentro del nivel máximo (30% de ahorro). */
  progreso: number
  /** Tasa de ahorro del mes, en porcentaje entero. null si no hubo ingresos. */
  tasaDeAhorro: number | null
  /** Solo el nivel más alto muestra el badge dorado. */
  esGold: boolean
}

/** Un vencimiento cercano, para la campana de notificaciones. */
export type Aviso = {
  id: string
  titulo: string
  detalle: string
  /** Días que faltan; 0 = hoy. */
  enDias: number
  urgente: boolean
}

/** A partir de este ahorro mensual el nivel es Gold. */
const AHORRO_GOLD = 0.3

function nivelPara(tasa: number | null): NivelAurem {
  if (tasa === null) {
    return { nombre: 'Aurem', progreso: 0, tasaDeAhorro: null, esGold: false }
  }

  const fraccion = Math.max(0, Math.min(1, tasa / 100 / AHORRO_GOLD))
  const porcentaje = Math.round(tasa)

  if (tasa >= AHORRO_GOLD * 100) {
    return { nombre: 'Aurem Gold Tier', progreso: 1, tasaDeAhorro: porcentaje, esGold: true }
  }
  if (tasa >= 15) {
    return {
      nombre: 'Aurem Silver Tier',
      progreso: fraccion,
      tasaDeAhorro: porcentaje,
      esGold: false,
    }
  }
  return { nombre: 'Aurem Base', progreso: fraccion, tasaDeAhorro: porcentaje, esGold: false }
}

/** Días desde `hoy` hasta el día `dia` del mes en curso o del siguiente. */
function diasHasta(hoy: string, dia: number): number {
  const [anio, mes, diaDeHoy] = hoy.split('-').map(Number)
  const ultimoDeEste = new Date(Date.UTC(anio, mes, 0)).getUTCDate()

  if (Math.min(dia, ultimoDeEste) >= diaDeHoy) return Math.min(dia, ultimoDeEste) - diaDeHoy

  // Ya pasó este mes: la próxima ocurrencia es el mes que viene.
  const ultimoDelProximo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()
  return ultimoDeEste - diaDeHoy + Math.min(dia, ultimoDelProximo)
}

/** Avisos de cierre y vencimiento dentro de la ventana indicada. */
export function construirAvisos(tarjetas: Tarjeta[], hoy: string, ventanaEnDias = 7): Aviso[] {
  const avisos: Aviso[] = []

  for (const tarjeta of tarjetas) {
    const { closing_day: cierre, due_day: vence } = tarjeta.detalle

    if (cierre) {
      const dias = diasHasta(hoy, cierre)
      if (dias <= ventanaEnDias) {
        avisos.push({
          id: `${tarjeta.id}:cierre`,
          titulo: `Cierra ${tarjeta.name}`,
          detalle: dias === 0 ? 'Cierra hoy' : `En ${dias} día${dias === 1 ? '' : 's'}`,
          enDias: dias,
          urgente: false,
        })
      }
    }

    if (vence) {
      const dias = diasHasta(hoy, vence)
      if (dias <= ventanaEnDias) {
        avisos.push({
          id: `${tarjeta.id}:vencimiento`,
          titulo: `Vence ${tarjeta.name}`,
          detalle: dias === 0 ? 'Vence hoy' : `En ${dias} día${dias === 1 ? '' : 's'}`,
          enDias: dias,
          // Un pago vencido cuesta plata: ese sí se marca en rojo.
          urgente: dias <= 2,
        })
      }
    }
  }

  return avisos.sort((a, b) => a.enDias - b.enDias)
}

/**
 * Tasa de ahorro del mes sobre el libro en pesos, que es el principal.
 *
 * Si no hubo ingresos en pesos se prueba con dólares, y si tampoco hubo se
 * devuelve null: sin ingresos, la tasa no está definida.
 */
export function calcularTasaDeAhorro(
  movimientos: { amount: number; currency: string | null; type: string }[]
): number | null {
  const acumular = (moneda: Moneda, tipo: string) =>
    movimientos
      .filter((m) => (m.currency === 'USD' ? 'USD' : 'ARS') === moneda && m.type === tipo)
      .reduce((suma, m) => suma + Number(m.amount), 0)

  for (const moneda of ['ARS', 'USD'] as Moneda[]) {
    const ingresos = acumular(moneda, 'INCOME')
    if (ingresos <= 0) continue
    const gastos = acumular(moneda, 'EXPENSE')
    return ((ingresos - gastos) / ingresos) * 100
  }

  return null
}

/** Nivel y avisos que consume el header. Una sola query extra por request. */
export async function cargarDatosDeCabecera(
  supabase: SupabaseClient,
  tarjetas: Tarjeta[],
  hoy: string
): Promise<{ nivel: NivelAurem; avisos: Aviso[] }> {
  const { desde, hasta } = rangoDelMesActual()

  const { data } = await supabase
    .from('transactions')
    .select('amount, currency, type')
    .gte('date', desde)
    .lte('date', hasta)

  return {
    nivel: nivelPara(calcularTasaDeAhorro(data ?? [])),
    avisos: construirAvisos(tarjetas, hoy),
  }
}
