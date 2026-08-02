import type { Moneda } from './types'

/** Un consumo tal como sale del parseo del resumen. */
export type ConsumoImportado = {
  date: string
  description: string
  amount: number
  current_installment: number | null
  total_installments: number | null
  currency: Moneda
}

/** Un movimiento ya guardado, contra el que se concilia. */
export type MovimientoExistente = {
  id: string
  date: string
  description: string | null
  amount: number
  currency: Moneda
  installment_current: number | null
  installment_total: number | null
}

export type Veredicto = 'nuevo' | 'duplicado' | 'diferencia'

export type ConsumoConciliado = {
  consumo: ConsumoImportado
  veredicto: Veredicto
  /** El movimiento con el que se emparejó, si hubo alguno. */
  existente: MovimientoExistente | null
  /** Diferencia de importe cuando el veredicto es 'diferencia'. */
  diferencia: number
  motivo: string
}

/** Tolerancia de fechas: el resumen suele imputar con uno o dos días de corrimiento. */
const DIAS_DE_TOLERANCIA = 3
/** Tolerancia de importe para considerar dos montos "el mismo". */
const TOLERANCIA_IMPORTE = 0.5
/** Por encima de esto se considera el mismo comercio. */
const UMBRAL_SIMILITUD = 0.72

const MS_POR_DIA = 86_400_000

function diasEntre(a: string, b: string): number {
  return Math.abs(
    (new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / MS_POR_DIA
  )
}

/**
 * Normaliza un texto de comercio para comparar: sin tildes, sin puntuación,
 * sin los sufijos de cuota que agrega el banco.
 */
export function normalizarDescripcion(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, ' ')
    .replace(/\bcuota\s*\d+\s*(de|\/)\s*\d+\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Similitud por bigramas (coeficiente de Sørensen–Dice).
 *
 * Se eligió sobre una comparación exacta porque los bancos abrevian y truncan:
 * "MERPAGO*CARNICERIA" y "Mercado Pago Carniceria" son el mismo consumo.
 */
export function similitud(a: string, b: string): number {
  const x = normalizarDescripcion(a)
  const y = normalizarDescripcion(b)

  if (!x || !y) return 0
  if (x === y) return 1
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0

  const bigramas = (s: string) => {
    const pares = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const par = s.slice(i, i + 2)
      pares.set(par, (pares.get(par) ?? 0) + 1)
    }
    return pares
  }

  const ax = bigramas(x)
  const by = bigramas(y)

  let comunes = 0
  for (const [par, veces] of ax) {
    const enB = by.get(par) ?? 0
    comunes += Math.min(veces, enB)
  }

  return (2 * comunes) / (x.length - 1 + (y.length - 1))
}

/**
 * Concilia los consumos de un resumen contra lo que ya está guardado.
 *
 * Criterio de emparejamiento, en orden:
 *   1. misma moneda (obligatorio)
 *   2. misma cuota del mismo plan, si ambos la declaran
 *   3. fecha dentro de ±3 días
 *   4. descripción similar por encima del 72%
 *
 * Con pareja e importe igual → duplicado. Con pareja e importe distinto →
 * diferencia (para revisar a mano). Sin pareja → nuevo.
 */
export function conciliar(
  importados: ConsumoImportado[],
  existentes: MovimientoExistente[]
): ConsumoConciliado[] {
  // Un movimiento existente no puede emparejarse dos veces: si el resumen
  // repite un comercio el mismo día, el segundo tiene que quedar como nuevo.
  const yaUsados = new Set<string>()

  return importados.map((consumo) => {
    let mejor: MovimientoExistente | null = null
    let mejorPuntaje = 0

    for (const existente of existentes) {
      if (yaUsados.has(existente.id)) continue
      if (existente.currency !== consumo.currency) continue
      if (diasEntre(existente.date, consumo.date) > DIAS_DE_TOLERANCIA) continue

      // Si ambos declaran cuota, tiene que ser la misma del mismo plan.
      const ambosEnCuotas =
        consumo.current_installment !== null && existente.installment_current !== null
      if (ambosEnCuotas) {
        if (
          consumo.current_installment !== existente.installment_current ||
          consumo.total_installments !== existente.installment_total
        ) {
          continue
        }
      }

      const puntaje = similitud(consumo.description, existente.description ?? '')
      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje
        mejor = existente
      }
    }

    if (!mejor || mejorPuntaje < UMBRAL_SIMILITUD) {
      return {
        consumo,
        veredicto: 'nuevo' as const,
        existente: null,
        diferencia: 0,
        motivo: 'No se encontró un movimiento parecido.',
      }
    }

    yaUsados.add(mejor.id)
    const diferencia = Math.round((consumo.amount - Number(mejor.amount)) * 100) / 100

    if (Math.abs(diferencia) <= TOLERANCIA_IMPORTE) {
      return {
        consumo,
        veredicto: 'duplicado' as const,
        existente: mejor,
        diferencia: 0,
        motivo: `Ya registrado el ${mejor.date}.`,
      }
    }

    return {
      consumo,
      veredicto: 'diferencia' as const,
      existente: mejor,
      diferencia,
      motivo: `Coincide con un movimiento del ${mejor.date} pero por otro importe.`,
    }
  })
}

/** Conteos por veredicto, para las pestañas de la UI. */
export function resumirConciliacion(resultado: ConsumoConciliado[]) {
  return {
    nuevos: resultado.filter((r) => r.veredicto === 'nuevo').length,
    duplicados: resultado.filter((r) => r.veredicto === 'duplicado').length,
    diferencias: resultado.filter((r) => r.veredicto === 'diferencia').length,
  }
}
