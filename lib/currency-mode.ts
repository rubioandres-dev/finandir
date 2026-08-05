import { MONEDAS_POR_DEFECTO, normalizarMoneda } from './monedas'
import type { Moneda } from './types'

/**
 * Moneda activa de la app, global y persistente.
 *
 * POR QUÉ UNA COOKIE Y NO SOLO UN CONTEXTO DE REACT
 *
 * El pedido es que el modo filtre cuentas, movimientos, tarjetas y
 * presupuestos en TODAS las vistas de gestión. Pero esas vistas son Server
 * Components: traen los datos de Supabase en el servidor y mandan HTML ya
 * armado. Un contexto de cliente sobre localStorage no puede filtrar eso —
 * llegaría tarde, cuando el HTML ya se generó con las dos monedas adentro.
 *
 * Con una cookie el servidor lee el modo ANTES de consultar, así que cada
 * vista puede filtrar en el origen. El contexto de cliente sigue existiendo
 * para que el toggle se sienta instantáneo, y escribe esta misma cookie.
 *
 * `ARS` es el default: es la moneda en la que vive el día a día de la app, y
 * las filas anteriores al multi-moneda no tienen `currency`.
 *
 * ESTE MÓDULO NO PUEDE IMPORTAR `next/headers`. Lo importa
 * `currency-provider.tsx`, que es cliente, y aunque solo tome las constantes,
 * el grafo de módulos arrastraría igual la API de servidor y el build falla.
 * El lector de la cookie vive aparte, en `currency-mode-server.ts`.
 */
export const COOKIE_MONEDA = 'finandir:moneda'

/** Un año: es una preferencia, no una sesión. */
export const MAX_EDAD_COOKIE_MONEDA = 60 * 60 * 24 * 365

/**
 * Moneda activa a partir del valor crudo de la cookie.
 *
 * `permitidas` son las divisas del perfil: si la cookie guarda una que el
 * usuario sacó de su lista, se cae a la principal (la primera). Es la regla de
 * "si la moneda activa no está incluida, se elige la primera", y vive del lado
 * del servidor a propósito — el HTML tiene que venir ya filtrado con la misma
 * moneda con la que arranca el cliente.
 */
export function normalizarModo(
  valor: string | undefined | null,
  permitidas: Moneda[] = MONEDAS_POR_DEFECTO
): Moneda {
  const principal = permitidas[0] ?? 'ARS'
  const codigo = valor?.trim().toUpperCase()
  if (!codigo) return principal
  return permitidas.includes(codigo) ? codigo : principal
}

/**
 * Filtra por moneda tratando como pesos lo que no la declara.
 *
 * Las filas anteriores a la migración multi-moneda tienen `currency` en null,
 * y son pesos. Sin este default desaparecerían de la vista en modo ARS.
 *
 * Antes esto era `currency === 'USD' ? 'USD' : 'ARS'`, que con una sola divisa
 * más deja de ser un default y pasa a ser un error: una cuenta en euros se
 * contaba como pesos. `normalizarMoneda` compara contra el catálogo entero.
 */
export function esDeLaMoneda(
  fila: { currency?: string | null },
  moneda: Moneda
): boolean {
  return normalizarMoneda(fila.currency) === moneda
}
