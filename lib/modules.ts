/**
 * Qué secciones de la app están activas para cada usuario.
 *
 * POR QUÉ "AUSENTE" SIGNIFICA ACTIVO
 *
 * El JSONB guarda solo lo que el usuario apagó. Un módulo que no figura en el
 * objeto se considera prendido. Eso hace que agregar una sección nueva no
 * requiera tocar ni una fila: aparece disponible para todos, y sólo escribe
 * quien decide apagarla.
 *
 * Al revés —guardar los prendidos— cada módulo nuevo saldría apagado para todo
 * el mundo hasta que alguien lo descubriera en Ajustes, que es exactamente lo
 * contrario de lo que uno quiere al publicar una feature.
 */

export const MODULOS = [
  'accounts',
  'transactions',
  'investments',
  'smart_spend',
  'commitments',
  'calendar',
  'debts',
  'goals',
  'shared_expenses',
  'fire',
] as const

export type Modulo = (typeof MODULOS)[number]

/**
 * Los que no se pueden apagar.
 *
 * Sin cuentas no hay dónde imputar un movimiento, y sin movimientos no hay
 * app. Apagarlos dejaría una interfaz que no puede hacer nada, así que el
 * switch va bloqueado en vez de permitir un estado inservible.
 */
export const MODULOS_FIJOS: Modulo[] = ['accounts', 'transactions']

export type EstadoDeModulos = Partial<Record<Modulo, boolean>>

export function esModuloFijo(modulo: Modulo): boolean {
  return MODULOS_FIJOS.includes(modulo)
}

/** Un módulo está activo si es fijo, o si nadie lo apagó explícitamente. */
export function moduloActivo(estado: EstadoDeModulos, modulo: Modulo): boolean {
  if (esModuloFijo(modulo)) return true
  return estado[modulo] !== false
}

/** Normaliza lo que venga del JSONB: descarta claves que no son módulos. */
export function normalizarModulos(valor: unknown): EstadoDeModulos {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {}

  const limpio: EstadoDeModulos = {}
  for (const [clave, activo] of Object.entries(valor as Record<string, unknown>)) {
    if (!MODULOS.includes(clave as Modulo)) continue
    if (typeof activo !== 'boolean') continue
    // Los fijos no se guardan: su estado no es negociable.
    if (esModuloFijo(clave as Modulo)) continue
    limpio[clave as Modulo] = activo
  }
  return limpio
}

/** La ruta que cada módulo ocupa. Sirve para filtrar la navegación. */
export const RUTA_DE_MODULO: Record<Modulo, string> = {
  accounts: '/dashboard/accounts',
  transactions: '/dashboard/transactions',
  investments: '/dashboard/investments',
  smart_spend: '/dashboard/smart-spend',
  commitments: '/dashboard/commitments',
  calendar: '/dashboard/calendar',
  debts: '/dashboard/debts',
  goals: '/dashboard/goals',
  shared_expenses: '/dashboard/shared-expenses',
  fire: '/dashboard/fire',
}
