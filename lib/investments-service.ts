import type { SupabaseClient } from '@supabase/supabase-js'
import { MONEDAS_POR_DEFECTO, normalizarMoneda, type TotalPorMoneda } from './monedas'
import {
  PLAZOS_LIQUIDOS,
  type Inversion,
  type Moneda,
  type PlazoDeLiquidez,
  type TipoDeActivo,
} from './types'

/** TNA que se asume cuando el usuario todavía no cargó ninguna inversión. */
export const TNA_POR_DEFECTO = 40

/**
 * Foto de la cartera, siempre desagregada por moneda: un total que mezcle
 * pesos y dólares no representa nada, igual que en `accounts-service`.
 */
export type ResumenDeInversiones = {
  /** Costo: lo que se puso. */
  invertido: TotalPorMoneda
  /** Valor de mercado hoy. Es el que cuenta como patrimonio. */
  valorActual: TotalPorMoneda
  /** Valor actual − invertido. Negativo cuando la cartera pierde. */
  resultado: TotalPorMoneda
  /** Valor actual de lo que se rescata el mismo día (T+0). */
  liquidezInmediata: TotalPorMoneda
  /**
   * TNA promedio ponderada de los activos líquidos (T+0 y T+1), por moneda.
   * `null` cuando esa moneda no tiene activos líquidos con valor.
   */
  tnaLiquida: Record<Moneda, number | null>
}

export type TramoDeDistribucion = {
  tipo: TipoDeActivo
  valor: number
  /** Porcentaje del total de esa moneda, 0–100 con un decimal. */
  porcentaje: number
}

function ceros(monedas: Moneda[]): Map<Moneda, number> {
  return new Map(monedas.map((m) => [m, 0]))
}

function aTotal(acumulado: Map<Moneda, number>): TotalPorMoneda {
  return [...acumulado].map(([moneda, valor]) => ({
    moneda,
    valor: Math.round(valor * 100) / 100,
  }))
}

/** Las filas viejas o mal cargadas caen a ARS, como en el resto de la app. */
function monedaDe(inversion: Inversion): Moneda {
  return normalizarMoneda(inversion.currency)
}

function esLiquida(plazo: PlazoDeLiquidez): boolean {
  return PLAZOS_LIQUIDOS.includes(plazo)
}

/**
 * TNA promedio ponderada por monto de los activos que se pueden rescatar a
 * tiempo para cubrir un gasto (T+0 y T+1).
 *
 * Pondera por `current_value` y no por `amount_invested`: lo que rinde de acá
 * en adelante es la plata que hay hoy, no la que se puso en su momento.
 *
 * Un plazo fijo a 90 días queda afuera aunque pague más. No es un descuido:
 * esta tasa mide el costo de oportunidad de gastar hoy, y esa plata no está
 * disponible hoy. Meterla inflaría la tasa y haría recomendar cuotas de más.
 *
 * Devuelve `null` si no hay activos líquidos con valor: quien llama decide si
 * cae al valor por defecto o si prefiere no opinar.
 */
export function calcularTnaLiquidaPonderada(
  inversiones: Inversion[],
  moneda: Moneda
): number | null {
  let ponderado = 0
  let base = 0

  for (const inversion of inversiones) {
    if (monedaDe(inversion) !== moneda) continue
    if (!esLiquida(inversion.liquidity_term)) continue

    const valor = Number(inversion.current_value ?? 0)
    if (!Number.isFinite(valor) || valor <= 0) continue

    ponderado += valor * Number(inversion.expected_tna ?? 0)
    base += valor
  }

  if (base <= 0) return null
  return Math.round((ponderado / base) * 100) / 100
}

/**
 * TNA a usar para descontar un gasto en esta moneda: la real del usuario, o
 * el 40 % por defecto si todavía no cargó inversiones líquidas.
 */
export function tnaLiquidaOPorDefecto(inversiones: Inversion[], moneda: Moneda): number {
  return calcularTnaLiquidaPonderada(inversiones, moneda) ?? TNA_POR_DEFECTO
}

/**
 * Días con los que se prorratea una TNA a un mes.
 *
 * 30/365 y no 1/12: la TNA es una tasa ANUAL sobre 365 días, así que el mes
 * equivalente son 30 de esos días. Dividir por 12 daría 30,42 días y un 1,4 %
 * de más — poco por mes, pero es un número que el usuario va a comparar contra
 * su resumen real y tiene que cerrar.
 */
const DIAS_DEL_MES = 30
const DIAS_DEL_ANIO = 365

/**
 * Lo que rinde la cartera en un mes, a la tasa declarada.
 *
 * ES UNA PROYECCIÓN, NO UN RENDIMIENTO MEDIDO
 *
 * Sale de multiplicar el valor de hoy por la TNA que el usuario cargó. Si esa
 * TNA está desactualizada, esto también. No se contrasta contra el resultado
 * real (`current_value − amount_invested`) a propósito: son dos preguntas
 * distintas —cuánto ganó hasta ahora contra cuánto genera por mes— y mezclarlas
 * en un solo número no responde ninguna.
 *
 * Se pondera por `current_value` y no por `amount_invested`: lo que rinde de acá
 * en adelante es la plata que hay hoy, no la que se puso en su momento.
 */
export function gananciaMensualEstimada(inversiones: Inversion[], moneda: Moneda): number {
  let total = 0

  for (const inversion of inversiones) {
    if (monedaDe(inversion) !== moneda) continue

    const valor = Number(inversion.current_value ?? 0)
    const tna = Number(inversion.expected_tna ?? 0)
    if (!Number.isFinite(valor) || !Number.isFinite(tna)) continue
    if (valor <= 0 || tna <= 0) continue

    total += valor * (tna / 100) * (DIAS_DEL_MES / DIAS_DEL_ANIO)
  }

  return Math.round(total * 100) / 100
}

/** La misma cuenta para un solo activo. La usa la calculadora del formulario. */
export function rendimientoMensualDe(monto: number, tna: number): number {
  if (!Number.isFinite(monto) || !Number.isFinite(tna) || monto <= 0 || tna <= 0) return 0
  return Math.round(monto * (tna / 100) * (DIAS_DEL_MES / DIAS_DEL_ANIO) * 100) / 100
}

/** Reparto por tipo de activo dentro de UNA moneda, ordenado de mayor a menor. */
export function distribucionPorTipo(
  inversiones: Inversion[],
  moneda: Moneda
): TramoDeDistribucion[] {
  const porTipo = new Map<TipoDeActivo, number>()
  let total = 0

  for (const inversion of inversiones) {
    if (monedaDe(inversion) !== moneda) continue
    const valor = Number(inversion.current_value ?? 0)
    if (!Number.isFinite(valor) || valor <= 0) continue

    porTipo.set(inversion.asset_type, (porTipo.get(inversion.asset_type) ?? 0) + valor)
    total += valor
  }

  if (total <= 0) return []

  return [...porTipo.entries()]
    .map(([tipo, valor]) => ({
      tipo,
      valor: Math.round(valor * 100) / 100,
      porcentaje: Math.round((valor / total) * 1000) / 10,
    }))
    .sort((a, b) => b.valor - a.valor)
}

/**
 * Resume la cartera. Función pura, para poder verificarla sin base de datos.
 */
export function resumirInversiones(
  inversiones: Inversion[],
  monedas: Moneda[] = MONEDAS_POR_DEFECTO
): ResumenDeInversiones {
  const invertido = ceros(monedas)
  const valorActual = ceros(monedas)
  const liquidezInmediata = ceros(monedas)

  for (const inversion of inversiones) {
    const moneda = monedaDe(inversion)
    const costo = Number(inversion.amount_invested ?? 0)
    const valor = Number(inversion.current_value ?? 0)

    invertido.set(moneda, (invertido.get(moneda) ?? 0) + (Number.isFinite(costo) ? costo : 0))
    valorActual.set(moneda, (valorActual.get(moneda) ?? 0) + (Number.isFinite(valor) ? valor : 0))

    // Solo T+0: "inmediata" es hoy, no mañana.
    if (inversion.liquidity_term === 'T0' && Number.isFinite(valor)) {
      liquidezInmediata.set(moneda, (liquidezInmediata.get(moneda) ?? 0) + valor)
    }
  }

  // Las claves reales pueden incluir divisas que estaban en los datos y no en
  // el perfil.
  const todas = [...new Set([...valorActual.keys(), ...invertido.keys()])]
  const resultado = ceros(todas)
  for (const moneda of todas) {
    resultado.set(moneda, (valorActual.get(moneda) ?? 0) - (invertido.get(moneda) ?? 0))
  }

  return {
    invertido: aTotal(invertido),
    valorActual: aTotal(valorActual),
    resultado: aTotal(resultado),
    liquidezInmediata: aTotal(liquidezInmediata),
    tnaLiquida: Object.fromEntries(
      todas.map((moneda) => [moneda, calcularTnaLiquidaPonderada(inversiones, moneda)])
    ),
  }
}

/**
 * Códigos con los que Postgres/PostgREST avisan que falta la migración.
 * PGRST205 es "la tabla no está en el cache del esquema", 42P01 "no existe".
 */
function faltaLaTabla(codigo?: string): boolean {
  return codigo === 'PGRST205' || codigo === 'PGRST204' || codigo === '42P01'
}

export const FALTA_MIGRACION_INVERSIONES =
  'Falta el esquema de inversiones. Ejecutá migrations/006_investments_and_smart_spend.sql.'

/** Inversiones del usuario, de la más reciente a la más vieja. */
export async function cargarInversiones(
  supabase: SupabaseClient,
  monedas: Moneda[] = MONEDAS_POR_DEFECTO
): Promise<{
  inversiones: Inversion[]
  resumen: ResumenDeInversiones
  error: string | null
}> {
  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .order('created_at', { ascending: false })

  const inversiones = (data ?? []) as Inversion[]

  return {
    inversiones,
    resumen: resumirInversiones(inversiones, monedas),
    error: error ? (faltaLaTabla(error.code) ? FALTA_MIGRACION_INVERSIONES : error.message) : null,
  }
}
