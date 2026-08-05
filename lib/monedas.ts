import type { Cotizacion } from './rates'
import type { Moneda } from './types'

/**
 * Divisas que la app sabe manejar.
 *
 * Es un CATÁLOGO, no la lista activa: qué divisas ve un usuario sale de su
 * perfil (`selected_currencies`, migración 007). Este array es lo que se le
 * ofrece elegir en el onboarding y en Ajustes, y tiene que coincidir con el
 * CHECK `user_profiles_divisas_validas` de la base.
 *
 * El orden es el de la lista de selección: primero las dos del día a día.
 */
export const CATALOGO_MONEDAS: { codigo: Moneda; nombre: string; simbolo: string }[] = [
  { codigo: 'ARS', nombre: 'Peso argentino', simbolo: '$' },
  { codigo: 'USD', nombre: 'Dólar', simbolo: 'US$' },
  { codigo: 'EUR', nombre: 'Euro', simbolo: '€' },
  { codigo: 'BRL', nombre: 'Real brasileño', simbolo: 'R$' },
  { codigo: 'CLP', nombre: 'Peso chileno', simbolo: 'CLP$' },
  { codigo: 'UYU', nombre: 'Peso uruguayo', simbolo: '$U' },
]

/**
 * Los códigos del catálogo como tupla, que es lo que `z.enum` necesita.
 *
 * Es la lista que valida TODOS los formularios que guardan una moneda. Antes
 * cada uno tenía su `z.enum(['ARS','USD'])` cableado, o sea: seis lugares
 * distintos donde agregar una divisa nueva y olvidarse de uno.
 */
export const CODIGOS_DE_MONEDA = CATALOGO_MONEDAS.map((m) => m.codigo) as [Moneda, ...Moneda[]]

const CODIGOS_VALIDOS = new Set<string>(CODIGOS_DE_MONEDA)

/**
 * Las divisas de un usuario que todavía no eligió.
 *
 * Es también el fallback cuando la migración 007 no está aplicada: la app
 * sigue funcionando exactamente como antes de las divisas dinámicas.
 */
export const MONEDAS_POR_DEFECTO: Moneda[] = ['ARS', 'USD']

/**
 * Compatibilidad: varias vistas todavía razonan sobre el par clásico.
 *
 * @deprecated Usá las divisas del perfil (`cargarContextoDeMonedas`). Esto
 * queda para los lugares donde la lista no está disponible.
 */
export const MONEDAS = MONEDAS_POR_DEFECTO

export function nombreDeMoneda(codigo: Moneda): string {
  return CATALOGO_MONEDAS.find((m) => m.codigo === codigo)?.nombre ?? codigo
}

/**
 * Lleva a un código ISO usable lo que venga de la base o de un formulario.
 *
 * Las filas anteriores al multi-moneda tienen `currency` en null y son pesos.
 * Un código que no está en el catálogo también cae en pesos: es el mismo
 * criterio conservador de antes, pero ahora aplicado sobre el catálogo entero
 * y no sobre `!== 'USD'`, que mandaba los euros a la bolsa de los pesos.
 */
export function normalizarMoneda(valor: string | null | undefined): Moneda {
  const codigo = valor?.trim().toUpperCase()
  if (!codigo) return 'ARS'
  return CODIGOS_VALIDOS.has(codigo) ? codigo : 'ARS'
}

/**
 * Deja una lista de divisas usable: normalizada, sin repetidos y no vacía.
 * Conserva el orden, porque la primera es la divisa principal.
 */
export function normalizarListaDeMonedas(valores: unknown): Moneda[] {
  if (!Array.isArray(valores)) return [...MONEDAS_POR_DEFECTO]

  const limpias: Moneda[] = []
  for (const valor of valores) {
    if (typeof valor !== 'string') continue
    const codigo = valor.trim().toUpperCase()
    if (!CODIGOS_VALIDOS.has(codigo) || limpias.includes(codigo)) continue
    limpias.push(codigo)
  }

  return limpias.length > 0 ? limpias : [...MONEDAS_POR_DEFECTO]
}

/** Total de una magnitud, desagregado por moneda. Nunca se suman entre sí. */
export type TotalPorMoneda = { moneda: Moneda; valor: number }[]

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100
}

/**
 * Acumula importes agrupando por moneda.
 *
 * Cada divisa es un libro paralelo: un total único que las mezcle no
 * representa nada, así que siempre se devuelve una entrada por moneda.
 *
 * `monedas` fija qué buckets existen aunque estén en cero — sirve para que una
 * divisa recién elegida aparezca en la vista con un 0 en vez de desaparecer.
 * Las que tengan movimientos y no estén en la lista se agregan igual: perder
 * plata de la vista sería peor que mostrar una columna de más.
 */
export function totalizarPorMoneda(
  movimientos: { amount: number; currency?: string | null }[],
  monedas: Moneda[] = MONEDAS_POR_DEFECTO
): TotalPorMoneda {
  const acumulado = new Map<Moneda, number>(monedas.map((m) => [m, 0]))

  for (const movimiento of movimientos) {
    const moneda = normalizarMoneda(movimiento.currency)
    acumulado.set(moneda, (acumulado.get(moneda) ?? 0) + Number(movimiento.amount))
  }

  return [...acumulado].map(([moneda, valor]) => ({ moneda, valor: redondear(valor) }))
}

/**
 * Equivalente aproximado en la otra moneda, solo para mostrar junto al ≈.
 * Nunca alimenta un total ni un saldo.
 *
 * Sigue siendo ARS↔USD: es el par del MEP, que es la cotización que la app
 * persiste por movimiento en `amount_usd`. Para el resto de las divisas la
 * conversión vive en `lib/exchange.ts`, que sí maneja N pares.
 */
export function equivalenteAproximado(
  valor: number,
  moneda: Moneda,
  cotizacion: Cotizacion | null
): { valor: number; moneda: Moneda } | null {
  if (!cotizacion || cotizacion.venta <= 0) return null
  if (moneda !== 'ARS' && moneda !== 'USD') return null

  return moneda === 'ARS'
    ? { valor: redondear(valor / cotizacion.venta), moneda: 'USD' }
    : { valor: Math.round(valor * cotizacion.venta), moneda: 'ARS' }
}
