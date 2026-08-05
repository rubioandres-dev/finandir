// Solo para el servidor: se usa desde Server Components y Server Actions.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Moneda } from './types'

/**
 * Objetivos financieros y el sistema de logros AUREM.
 *
 * QUÉ ES UN TIER Y QUÉ NO ES
 *
 * No es un puntaje de tu salud financiera ni una nota. Es un registro de
 * logros: cada meta que se cumple POR PRIMERA VEZ suma XP, y el XP no baja
 * nunca. Un mes en el que se gasta de más no te quita nada — a lo sumo no
 * suma. Esa asimetría es la definición del módulo: reconocer, no vigilar.
 *
 * La consecuencia de diseño es que `achieved_at` se escribe una sola vez y no
 * se limpia, aunque el objetivo después deje de cumplirse.
 */

export const TIPOS_DE_OBJETIVO = [
  'SAVINGS_RATE',
  'INVESTMENT_RATE',
  'EMERGENCY_FUND',
  'CATEGORY_BUDGET',
  'DEBT_REDUCTION',
] as const

export type TipoDeObjetivo = (typeof TIPOS_DE_OBJETIVO)[number]

export type Objetivo = {
  id: string
  type: TipoDeObjetivo
  target_value: number
  current_value: number
  period: 'MONTHLY' | 'ONCE'
  currency: Moneda
  category_id: string | null
  achieved_at: string | null
  is_active: boolean
}

/** Un objetivo con su avance ya resuelto contra los datos reales. */
export type ObjetivoConAvance = Objetivo & {
  /** 0–1. Se recorta en 1: pasarse de la meta no da más que cumplirla. */
  avance: number
  /** Valor medido AHORA, que puede diferir del `current_value` cacheado. */
  medido: number
  cumplido: boolean
}

// --- Tiers -------------------------------------------------------------------

export const TIERS = [
  { codigo: 'BRONZE', nombre: 'Bronze', xp: 0, color: '#B87333' },
  { codigo: 'SILVER', nombre: 'Silver', xp: 100, color: '#C0C0C0' },
  { codigo: 'GOLD', nombre: 'Gold', xp: 300, color: '#F2CA4F' },
  { codigo: 'PLATINUM', nombre: 'Platinum', xp: 600, color: '#D9E4E8' },
  { codigo: 'BLACK', nombre: 'Black', xp: 1000, color: '#3A3A3A' },
] as const

export type Tier = (typeof TIERS)[number]

/** XP que suma cumplir un objetivo por primera vez. */
export const XP_POR_LOGRO = 50

export function tierPara(xp: number): Tier {
  // Del más alto al más bajo: el primero que se alcanza es el que vale.
  return [...TIERS].reverse().find((t) => xp >= t.xp) ?? TIERS[0]
}

export function siguienteTier(xp: number): Tier | null {
  return TIERS.find((t) => t.xp > xp) ?? null
}

/** 0–1 dentro del tier actual. 1 cuando ya se llegó al máximo. */
export function avanceDentroDelTier(xp: number): number {
  const actual = tierPara(xp)
  const siguiente = siguienteTier(xp)
  if (!siguiente) return 1

  const tramo = siguiente.xp - actual.xp
  return tramo <= 0 ? 1 : Math.min(1, (xp - actual.xp) / tramo)
}

// --- Medición ----------------------------------------------------------------

/**
 * Datos que hacen falta para medir cualquier objetivo.
 *
 * Se pasan ya calculados en vez de consultarlos acá: las páginas que muestran
 * objetivos ya cargaron los movimientos del mes y el patrimonio, y volver a
 * pedirlos sería duplicar dos queries por render.
 */
export type BaseDeMedicion = {
  ingresosDelMes: number
  gastosDelMes: number
  /** Valor de mercado de la cartera de inversiones. */
  inversiones: number
  /** Efectivo, bancos y billeteras. */
  liquido: number
  /** Deuda total en positivo: tarjetas + personales. */
  deuda: number
  /** Gasto del mes por categoría. */
  gastoPorCategoria: Map<string, number>
}

/**
 * Mide un objetivo contra los datos reales.
 *
 * Devuelve el valor logrado en la MISMA unidad que `target_value`, para que la
 * comparación sea directa y no haya conversiones escondidas.
 */
export function medirObjetivo(objetivo: Objetivo, base: BaseDeMedicion): number {
  switch (objetivo.type) {
    case 'SAVINGS_RATE':
      // Sin ingresos la tasa no está definida; se informa 0 para no inventar
      // un logro con el denominador vacío.
      if (base.ingresosDelMes <= 0) return 0
      return redondear(((base.ingresosDelMes - base.gastosDelMes) / base.ingresosDelMes) * 100)

    case 'INVESTMENT_RATE':
      if (base.ingresosDelMes <= 0) return 0
      return redondear((base.inversiones / base.ingresosDelMes) * 100)

    case 'EMERGENCY_FUND':
      // En MESES de gasto. Sin gastos del mes no hay divisor: se toma el
      // objetivo como cumplido solo si además hay algo líquido.
      if (base.gastosDelMes <= 0) return base.liquido > 0 ? objetivo.target_value : 0
      return redondear(base.liquido / base.gastosDelMes)

    case 'CATEGORY_BUDGET':
      return redondear(
        objetivo.category_id ? (base.gastoPorCategoria.get(objetivo.category_id) ?? 0) : 0
      )

    case 'DEBT_REDUCTION':
      return redondear(base.deuda)
  }
}

/**
 * Un objetivo se cumple hacia arriba o hacia abajo según el tipo.
 *
 * Ahorrar, invertir y tener fondo de emergencia son metas de MÍNIMO: se
 * cumplen al superarlas. Presupuesto y deuda son de MÁXIMO: se cumplen al
 * quedar por debajo. Tratarlos igual daría por logrado un presupuesto
 * justamente cuando se lo revienta.
 */
export function esDeMaximo(tipo: TipoDeObjetivo): boolean {
  return tipo === 'CATEGORY_BUDGET' || tipo === 'DEBT_REDUCTION'
}

export function calcularAvance(objetivo: Objetivo, medido: number): ObjetivoConAvance {
  const meta = objetivo.target_value

  if (esDeMaximo(objetivo.type)) {
    // Cuanto MENOS, mejor. El avance es cuánto del techo se consumió, así la
    // barra se llena a medida que uno se acerca al límite.
    const consumido = meta <= 0 ? 1 : medido / meta
    return {
      ...objetivo,
      medido,
      avance: Math.min(1, Math.max(0, consumido)),
      cumplido: medido <= meta,
    }
  }

  const avance = meta <= 0 ? 0 : medido / meta
  return {
    ...objetivo,
    medido,
    avance: Math.min(1, Math.max(0, avance)),
    cumplido: medido >= meta,
  }
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100
}

// --- Carga -------------------------------------------------------------------

export const FALTA_MIGRACION_OBJETIVOS =
  'Falta el esquema de objetivos. Ejecutá migrations/010_goals_and_aurem_tier.sql.'

function faltaLaTabla(codigo?: string): boolean {
  return codigo === 'PGRST205' || codigo === 'PGRST204' || codigo === '42P01'
}

export async function cargarObjetivos(supabase: SupabaseClient): Promise<{
  objetivos: Objetivo[]
  error: string | null
  faltaMigracion: boolean
}> {
  const { data, error } = await supabase
    .from('financial_goals')
    .select('id, type, target_value, current_value, period, currency, category_id, achieved_at, is_active')
    .eq('is_active', true)
    .order('created_at')

  if (error) {
    const falta = faltaLaTabla(error.code)
    return {
      objetivos: [],
      error: falta ? FALTA_MIGRACION_OBJETIVOS : error.message,
      faltaMigracion: falta,
    }
  }

  return {
    objetivos: (data ?? []).map((fila) => ({
      ...fila,
      target_value: Number(fila.target_value),
      current_value: Number(fila.current_value),
    })) as Objetivo[],
    error: null,
    faltaMigracion: false,
  }
}
