import type { Moneda } from './types'

/**
 * Presupuestos por categoría: el techo de gasto mensual.
 *
 * FUENTE ÚNICA DESDE LA 013
 *
 * Antes el mismo número vivía en dos lados. La tabla `budgets` (002) la editaba
 * Ajustes; los objetivos de tipo CATEGORY_BUDGET (010) los mostraba el Home. No
 * se sincronizaban, así que la misma categoría podía tener dos techos distintos
 * y ninguna pantalla lo indicaba. La 013 los junta en `category_budgets` y
 * apaga los objetivos migrados sin borrarlos.
 *
 * POR QUÉ UN PRESUPUESTO YA NO ES UN OBJETIVO
 *
 * Los objetivos suman XP la primera vez que se cumplen y ese XP no baja nunca:
 * es un registro de logros. Un techo de gasto no encaja ahí. "No me pasé de
 * $80.000 en delivery en marzo" no es un logro que se consigue una vez y queda
 * — es una pregunta que se vuelve a hacer todos los meses, y cuya respuesta del
 * mes pasado no dice nada de este. Meterlo en el sistema de XP obligaba a
 * elegir entre premiarlo una sola vez (inútil) o dejar que el XP bajara
 * (rompiendo la regla central del Tier).
 */

export type PresupuestoDeCategoria = {
  id: string
  category_id: string
  /** Techo mensual, siempre >= 0. */
  amount: number
  currency: Moneda
}

export const TABLA_PRESUPUESTOS = 'category_budgets'

export const FALTA_MIGRACION_PRESUPUESTOS =
  'Falta la tabla de presupuestos. Ejecutá migrations/013_category_budgets.sql en el SQL Editor de Supabase.'

/** Columnas que arman un `PresupuestoDeCategoria`. */
export const COLUMNAS_PRESUPUESTO = 'id, category_id, amount, currency'

/** Códigos con los que PostgREST/Postgres avisan que falta la tabla. */
export function faltaLaTabla(codigo?: string): boolean {
  return codigo === 'PGRST205' || codigo === 'PGRST204' || codigo === '42P01'
}

/** Una fila cruda de la tabla, ya con los números convertidos. */
export function normalizarPresupuesto(fila: {
  id: string
  category_id: string
  amount: number | string
  currency: string
}): PresupuestoDeCategoria {
  return {
    id: fila.id,
    category_id: fila.category_id,
    amount: Number(fila.amount),
    currency: fila.currency.trim() as Moneda,
  }
}

/** Lo que la UI necesita para dibujar una barra de progreso. */
export type AvanceDePresupuesto = {
  categoriaId: string
  nombre: string
  icono: string
  color: string
  gastado: number
  limite: number
  moneda: Moneda
  /** 0–1, recortado: pasarse del techo no llena más que llenarlo. */
  avance: number
  excedido: boolean
}

/**
 * Cruza presupuestos con lo gastado. Función pura: se verifica sin base.
 *
 * `gastadoPorCategoria` viene ya calculado desde la vista, que es la que cargó
 * los movimientos del mes: volver a pedirlos acá sería una query duplicada por
 * cada render.
 */
export function calcularAvances(
  presupuestos: PresupuestoDeCategoria[],
  categorias: { id: string; name: string; icon: string; color: string }[],
  gastadoPorCategoria: Map<string, number>
): AvanceDePresupuesto[] {
  const porId = new Map(categorias.map((c) => [c.id, c]))

  return presupuestos
    .flatMap((presupuesto) => {
      const categoria = porId.get(presupuesto.category_id)
      // Un presupuesto de una categoría borrada no se puede dibujar. El
      // `on delete cascade` de la 013 debería haberlo llevado, pero la fila
      // podría sobrevivir a una carga desincronizada.
      if (!categoria) return []

      const gastado = gastadoPorCategoria.get(presupuesto.category_id) ?? 0
      const limite = presupuesto.amount

      return [
        {
          categoriaId: categoria.id,
          nombre: categoria.name,
          icono: categoria.icon,
          color: categoria.color,
          gastado,
          limite,
          moneda: presupuesto.currency,
          avance: limite <= 0 ? 1 : Math.min(1, Math.max(0, gastado / limite)),
          excedido: limite > 0 && gastado > limite,
        },
      ]
    })
    // Los excedidos primero, y dentro de cada grupo el más lleno arriba: el
    // orden alfabético dejaba el problema del mes escondido en la letra T.
    .sort((a, b) => Number(b.excedido) - Number(a.excedido) || b.avance - a.avance)
}
