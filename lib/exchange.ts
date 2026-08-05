// Solo para el servidor: se usa desde Server Components y Server Actions.
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizarMoneda } from './monedas'
import { hoyEnArgentina, type Moneda } from './types'

/**
 * Tipos de cambio para N divisas.
 *
 * SEMÁNTICA DE UNA FILA DE `exchange_rates`
 *
 *   1 unidad de `base` vale `sell` unidades de `quote`.
 *
 * Todo lo que guarda este módulo usa ARS como `quote`, así que el mapa que
 * devuelve es "cuántos pesos vale una unidad de X". El peso es el pivote de
 * todas las conversiones no porque sea estable —no lo es— sino porque es la
 * moneda contra la que cotizan todas las fuentes que tenemos.
 *
 * QUÉ PASA SI FALTA LA MIGRACIÓN 007
 *
 * Antes de la 007 la tabla no tiene `base` ni `quote`: guarda una sola fila
 * por día, que siempre fue el MEP. Filtrar por par contra esa tabla revienta
 * con 42703, y no filtrar contra la tabla NUEVA devuelve varias filas por día
 * y rompe el `maybeSingle()`. Por eso el soporte se detecta una vez por
 * proceso y las dos formas conviven.
 */

/** Cuántos pesos vale una unidad de cada divisa. ARS siempre vale 1. */
export type MapaDeCambio = Map<Moneda, number>

export type ResultadoDeCambio = {
  mapa: MapaDeCambio
  /** Divisas pedidas para las que no se consiguió cotización. */
  faltantes: Moneda[]
  /** Fecha de las cotizaciones usadas (YYYY-MM-DD). */
  fecha: string
}

/** Fuentes de cotización contra el peso, por divisa. USD va por el MEP. */
const FUENTES: Record<string, { url: string; fuente: string }> = {
  EUR: { url: 'https://dolarapi.com/v1/cotizaciones/eur', fuente: 'dolarapi:eur' },
  BRL: { url: 'https://dolarapi.com/v1/cotizaciones/brl', fuente: 'dolarapi:brl' },
  CLP: { url: 'https://dolarapi.com/v1/cotizaciones/clp', fuente: 'dolarapi:clp' },
  UYU: { url: 'https://dolarapi.com/v1/cotizaciones/uyu', fuente: 'dolarapi:uyu' },
}

/**
 * `null` = todavía no se sabe.
 *
 * El SÍ se recuerda para siempre: una columna no desaparece. El NO se recuerda
 * sólo un rato, porque la 007 la aplica una persona en el SQL Editor mientras
 * el servidor ya está corriendo, y cachear el no para siempre obligaría a
 * redeployar para que la migración tuviera efecto.
 */
let soportaPares: boolean | null = null
let vencimientoDelNo = 0
const ESPERA_TRAS_UN_NO = 60_000

/** Códigos de Postgres/PostgREST para "esa columna no existe". */
function esColumnaFaltante(codigo: string | undefined): boolean {
  return codigo === '42703' || codigo === 'PGRST204'
}

export async function soportaParesDeDivisas(supabase: SupabaseClient): Promise<boolean> {
  if (soportaPares === true) return true
  if (soportaPares === false && Date.now() < vencimientoDelNo) return false

  const { error } = await supabase.from('exchange_rates').select('base').limit(1)
  soportaPares = !(error && esColumnaFaltante(error.code))

  if (!soportaPares) {
    vencimientoDelNo = Date.now() + ESPERA_TRAS_UN_NO
    console.warn('[exchange] exchange_rates sin base/quote: falta correr migrations/007')
  }

  return soportaPares
}

/** Cotización guardada de un par para una fecha. `null` si no hay. */
export async function leerCotizacionGuardada(
  supabase: SupabaseClient,
  base: Moneda,
  quote: Moneda,
  fecha: string
): Promise<{ compra: number | null; venta: number; fuente: string } | null> {
  const conPares = await soportaParesDeDivisas(supabase)

  // Sin las columnas, la única fila que existe es el MEP. Pedir cualquier otro
  // par contra esa tabla devolvería el MEP disfrazado, que sería un dato falso.
  if (!conPares && !(base === 'USD' && quote === 'ARS')) return null

  let consulta = supabase
    .from('exchange_rates')
    .select('source, buy, sell')
    .eq('date', fecha)

  if (conPares) {
    consulta = consulta.eq('base', base).eq('quote', quote)
  }

  const { data, error } = await consulta.maybeSingle()

  if (error || !data?.sell) return null

  return {
    compra: data.buy === null ? null : Number(data.buy),
    venta: Number(data.sell),
    fuente: (data.source as string) ?? 'desconocida',
  }
}

/**
 * Persiste una cotización. No lanza: si RLS la bloquea o falta la migración,
 * la app sigue con el valor en vivo y solo se pierde el histórico.
 */
export async function guardarCotizacion(
  supabase: SupabaseClient,
  fila: {
    fecha: string
    base: Moneda
    quote: Moneda
    compra: number | null
    venta: number
    fuente: string
  }
): Promise<void> {
  const conPares = await soportaParesDeDivisas(supabase)

  // Sin columnas de par, la tabla solo puede representar el MEP. Guardar un
  // euro ahí lo haría pasar por dólar en la próxima lectura.
  if (!conPares && !(fila.base === 'USD' && fila.quote === 'ARS')) return

  // Las columnas del par van sólo si existen: antes de la 007 mandarlas hace
  // que PostgREST rechace el insert entero.
  const registro = {
    date: fila.fecha,
    source: fila.fuente,
    buy: fila.compra,
    sell: fila.venta,
    ...(conPares ? { base: fila.base, quote: fila.quote } : {}),
  }

  const { error } = await supabase
    .from('exchange_rates')
    .upsert(registro, { onConflict: conPares ? 'date,base,quote' : 'date' })

  if (error) {
    console.error('[exchange] no se pudo persistir la cotización', error.message)
  }
}

type RespuestaDolarApi = { compra: number; venta: number; fechaActualizacion: string }

/** Pide a dolarapi cuántos pesos vale una unidad de `moneda`. */
async function pedirEnVivo(moneda: Moneda): Promise<{ compra: number | null; venta: number } | null> {
  const fuente = FUENTES[moneda]
  if (!fuente) return null

  try {
    const respuesta = await fetch(fuente.url, {
      next: { revalidate: 3600 },
      headers: { accept: 'application/json' },
    })
    if (!respuesta.ok) return null

    const datos = (await respuesta.json()) as RespuestaDolarApi
    if (!Number.isFinite(datos?.venta) || datos.venta <= 0) return null

    return {
      compra: Number.isFinite(datos.compra) && datos.compra > 0 ? Number(datos.compra) : null,
      venta: Number(datos.venta),
    }
  } catch (error) {
    console.error(`[exchange] falló la cotización de ${moneda}`, error)
    return null
  }
}

/**
 * Cuántos pesos vale una unidad de cada divisa pedida.
 *
 * El USD entra por el MEP, que es la cotización que la app ya persiste y usa
 * para convertir; el resto sale de dolarapi y se guarda en el mismo lugar.
 *
 * Nunca lanza y nunca es todo-o-nada: las divisas que no se pudieron cotizar
 * salen en `faltantes` y quien llame decide qué hacer. Preferimos un total
 * ausente a uno calculado con un tipo de cambio inventado.
 */
export async function obtenerMapaDeCambio(
  supabase: SupabaseClient,
  monedas: Moneda[],
  /** MEP ya resuelto por `obtenerCotizacionDelDia`, para no pedirlo dos veces. */
  mepVenta: number | null
): Promise<ResultadoDeCambio> {
  const fecha = hoyEnArgentina()
  const mapa: MapaDeCambio = new Map([['ARS', 1]])
  const faltantes: Moneda[] = []

  const pedidas = monedas.map(normalizarMoneda).filter((m) => m !== 'ARS')

  if (mepVenta && mepVenta > 0) mapa.set('USD', mepVenta)

  await Promise.all(
    [...new Set(pedidas)].map(async (moneda) => {
      if (mapa.has(moneda)) return

      const guardada = await leerCotizacionGuardada(supabase, moneda, 'ARS', fecha)
      if (guardada) {
        mapa.set(moneda, guardada.venta)
        return
      }

      const enVivo = await pedirEnVivo(moneda)
      if (!enVivo) return

      mapa.set(moneda, enVivo.venta)
      await guardarCotizacion(supabase, {
        fecha,
        base: moneda,
        quote: 'ARS',
        compra: enVivo.compra,
        venta: enVivo.venta,
        fuente: FUENTES[moneda]?.fuente ?? 'dolarapi',
      })
    })
  )

  for (const moneda of pedidas) {
    if (!mapa.has(moneda) && !faltantes.includes(moneda)) faltantes.push(moneda)
  }

  return { mapa, faltantes, fecha }
}

/**
 * Convierte usando el peso como pivote.
 * `null` si falta cualquiera de las dos puntas: no se inventa un cambio.
 */
export function convertir(
  valor: number,
  desde: Moneda,
  hacia: Moneda,
  mapa: MapaDeCambio
): number | null {
  if (desde === hacia) return valor

  const pesosPorUnidadOrigen = mapa.get(desde)
  const pesosPorUnidadDestino = mapa.get(hacia)

  if (!pesosPorUnidadOrigen || !pesosPorUnidadDestino) return null

  const enPesos = valor * pesosPorUnidadOrigen
  return Math.round((enPesos / pesosPorUnidadDestino) * 100) / 100
}
