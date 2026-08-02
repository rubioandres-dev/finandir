// Solo para el servidor: se usa desde Server Components y Server Actions.
// (No importamos 'server-only' porque no está entre las dependencias.)
import type { SupabaseClient } from '@supabase/supabase-js'
import { hoyEnArgentina } from './types'

const API_MEP = 'https://dolarapi.com/v1/dolares/bolsa'
export const FUENTE_MEP = 'dolarapi:bolsa'

export type Cotizacion = {
  fecha: string
  compra: number
  /**
   * Usamos "venta" para convertir ARS → USD: es el precio al que comprás
   * dólares, y es el valor que usaba la planilla original.
   */
  venta: number
  fuente: string
  /** true si salió de exchange_rates, false si se pidió a la API en vivo. */
  cacheada: boolean
}

type RespuestaDolarApi = {
  compra: number
  venta: number
  fechaActualizacion: string
}

/** Pide la cotización MEP a dolarapi.com. Lanza si la respuesta no sirve. */
export async function obtenerCotizacionEnVivo(): Promise<{ compra: number; venta: number }> {
  const respuesta = await fetch(API_MEP, {
    // La cotización cambia durante la rueda; una hora de caché es suficiente
    // y evita pegarle a la API en cada render.
    next: { revalidate: 3600 },
    headers: { accept: 'application/json' },
  })

  if (!respuesta.ok) {
    throw new Error(`dolarapi respondió ${respuesta.status}`)
  }

  const datos = (await respuesta.json()) as RespuestaDolarApi

  if (!Number.isFinite(datos?.venta) || datos.venta <= 0) {
    throw new Error('dolarapi devolvió una cotización inválida')
  }

  return { compra: Number(datos.compra), venta: Number(datos.venta) }
}

/**
 * Cotización del día. Si `exchange_rates` no tiene la fila de hoy, la pide a
 * la API y la guarda.
 *
 * Nunca lanza: si algo falla devuelve `null` y quien llama decide. Una caída
 * de dolarapi no puede impedir que el usuario registre un movimiento.
 */
export async function obtenerCotizacionDelDia(
  supabase: SupabaseClient
): Promise<Cotizacion | null> {
  const hoy = hoyEnArgentina()

  const { data: guardada } = await supabase
    .from('exchange_rates')
    .select('date, source, buy, sell')
    .eq('date', hoy)
    .maybeSingle()

  if (guardada?.sell) {
    return {
      fecha: guardada.date as string,
      compra: Number(guardada.buy ?? 0),
      venta: Number(guardada.sell),
      fuente: (guardada.source as string) ?? FUENTE_MEP,
      cacheada: true,
    }
  }

  let enVivo: { compra: number; venta: number }
  try {
    enVivo = await obtenerCotizacionEnVivo()
  } catch (error) {
    console.error('[rates] no se pudo obtener la cotización', error)
    // Último recurso: la última cotización conocida, aunque sea de otro día.
    return await ultimaCotizacionConocida(supabase)
  }

  // upsert por si dos requests simultáneos intentan guardar el mismo día.
  const { error } = await supabase
    .from('exchange_rates')
    .upsert(
      { date: hoy, source: FUENTE_MEP, buy: enVivo.compra, sell: enVivo.venta },
      { onConflict: 'date' }
    )

  if (error) {
    // Falta la policy de INSERT en exchange_rates, o RLS la bloquea.
    // Seguimos con el valor en vivo: la conversión funciona igual, solo que
    // no queda histórico.
    console.error('[rates] no se pudo persistir la cotización', error.message)
  }

  return {
    fecha: hoy,
    compra: enVivo.compra,
    venta: enVivo.venta,
    fuente: FUENTE_MEP,
    cacheada: false,
  }
}

async function ultimaCotizacionConocida(
  supabase: SupabaseClient
): Promise<Cotizacion | null> {
  const { data } = await supabase
    .from('exchange_rates')
    .select('date, source, buy, sell')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.sell) return null

  return {
    fecha: data.date as string,
    compra: Number(data.buy ?? 0),
    venta: Number(data.sell),
    fuente: (data.source as string) ?? FUENTE_MEP,
    cacheada: true,
  }
}

/** Redondea a 2 decimales sin arrastrar el error binario de los flotantes. */
function aDosDecimales(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

/**
 * Calcula el par (monto en su moneda, equivalente en USD).
 * Si no hay cotización disponible, `amount_usd` queda null: preferimos un
 * dato faltante a uno inventado.
 */
export function calcularMontoUsd(
  monto: number,
  moneda: 'ARS' | 'USD',
  cotizacion: Cotizacion | null
): number | null {
  if (moneda === 'USD') return aDosDecimales(monto)
  if (!cotizacion || cotizacion.venta <= 0) return null
  return aDosDecimales(monto / cotizacion.venta)
}

