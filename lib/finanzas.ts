import type { SupabaseClient } from '@supabase/supabase-js'
import { MONEDAS_POR_DEFECTO, nombreDeMoneda } from './monedas'
import type { Cuenta, Moneda, TipoCategoria } from './types'

// Este módulo tenía su propio `Moneda = 'ARS' | 'USD'`. Ahora reexporta el
// compartido: dos definiciones del mismo concepto es exactamente lo que hace
// que una se quede vieja cuando el usuario elige una tercera divisa.
export type { Moneda }

/** @deprecated Usá las divisas del perfil (`cargarContextoDeMonedas`). */
export const MONEDAS = MONEDAS_POR_DEFECTO

/**
 * Nombre de la cuenta que se crea sola para una moneda.
 *
 * Era un `Record` de dos entradas. Con divisas dinámicas tiene que responder
 * para cualquier código del catálogo, o la cuenta en euros se crearía con el
 * nombre `undefined`.
 */
export function nombreDeCuenta(moneda: Moneda): string {
  if (moneda === 'ARS') return 'Pesos'
  if (moneda === 'USD') return 'Dólares'
  return nombreDeMoneda(moneda)
}

/**
 * Devuelve la cuenta del usuario para esa moneda, creándola si hace falta.
 *
 * Cada moneda tiene su propia cuenta con su propio saldo: un gasto en dólares
 * nunca toca el saldo en pesos.
 *
 * POR QUÉ ESTO NO PUEDE USAR `maybeSingle()`
 *
 * Lo usaba, y era un bug. La versión original asumía UNA cuenta por moneda,
 * garantizada por el unique (user_id, currency) de migrations/002. Pero esa
 * misma migración lo DROPEA más abajo, justamente para que el módulo de
 * cuentas y tarjetas (003) pueda tener banco, efectivo y varias tarjetas en
 * pesos a la vez. La función nunca se actualizó.
 *
 * Con más de una cuenta en la moneda, `maybeSingle()` no devuelve la primera:
 * falla con PGRST116, "JSON object requested, multiple (or no) rows returned".
 * Lo disparaba cualquier alta sin cuenta explícita — el escáner de
 * comprobantes siempre, y el Smart Input cada vez que la IA no resolvía una.
 *
 * Ahora se elige una entre varias, con un criterio estable.
 */
export async function obtenerOCrearCuenta(
  supabase: SupabaseClient,
  userId: string,
  moneda: Moneda
): Promise<{ cuenta: Cuenta | null; error: string | null }> {
  const { cuenta, error } = await elegirCuentaPorDefecto(supabase, moneda)
  if (error) return { cuenta: null, error }
  if (cuenta) return { cuenta, error: null }

  const { data: creada, error: errorInsert } = await supabase
    .from('accounts')
    .insert({ user_id: userId, name: nombreDeCuenta(moneda), currency: moneda })
    .select()
    .single()

  if (!errorInsert) return { cuenta: creada as Cuenta, error: null }

  // 23505 = otro request creó la cuenta entre nuestra lectura y nuestro
  // insert. Releemos con el mismo criterio en vez de fallar.
  if (errorInsert.code === '23505') {
    const reintento = await elegirCuentaPorDefecto(supabase, moneda)
    if (reintento.error) return { cuenta: null, error: reintento.error }
    if (reintento.cuenta) return { cuenta: reintento.cuenta, error: null }
  }

  return { cuenta: null, error: errorInsert.message }
}

/**
 * Cuenta destino cuando el movimiento no dice a cuál va.
 *
 * El orden importa y no es arbitrario:
 *
 *   1. Nunca una TARJETA DE CRÉDITO. Mandar ahí un gasto sin que nadie lo
 *      haya pedido genera deuda en silencio, que es el peor default posible.
 *   2. Entre las demás, primero las líquidas (banco, efectivo, billetera):
 *      son de donde sale la plata de un gasto común.
 *   3. A igualdad, la más vieja. Es la que el usuario viene usando, y elegir
 *      por fecha de creación hace que la misma cuenta gane siempre — un
 *      criterio inestable mandaría cada gasto a una cuenta distinta.
 */
async function elegirCuentaPorDefecto(
  supabase: SupabaseClient,
  moneda: Moneda
): Promise<{ cuenta: Cuenta | null; error: string | null }> {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('currency', moneda)
    .order('created_at')

  if (error) return { cuenta: null, error: error.message }

  const cuentas = (data ?? []) as Cuenta[]
  const noTarjetas = cuentas.filter((c) => c.type !== 'CREDIT_CARD')

  return {
    cuenta: noTarjetas.find((c) => c.is_liquid) ?? noTarjetas[0] ?? null,
    error: null,
  }
}

/** Todas las cuentas del usuario, indexadas por moneda. */
export async function obtenerCuentasPorMoneda(
  supabase: SupabaseClient
): Promise<{ cuentas: Record<string, Cuenta>; error: string | null }> {
  const { data, error } = await supabase.from('accounts').select('*')
  if (error) return { cuentas: {}, error: error.message }

  const cuentas: Record<string, Cuenta> = {}
  for (const fila of (data ?? []) as Cuenta[]) cuentas[fila.currency] = fila
  return { cuentas, error: null }
}

/**
 * Resuelve el id de una categoría por nombre + tipo. Si no existe la crea:
 * la IA puede sugerir "Otros", que no viene en el seed de schema.sql.
 *
 * `name` es citext, así que la comparación ya es case-insensitive.
 */
export async function obtenerOCrearCategoria(
  supabase: SupabaseClient,
  userId: string,
  nombre: string,
  tipo: TipoCategoria
): Promise<{ categoriaId: string | null; error: string | null }> {
  const limpio = nombre.trim()
  if (!limpio) return { categoriaId: null, error: null }

  // Sin `maybeSingle()`, por lo mismo que en `obtenerOCrearCuenta`: desde
  // migrations/008 hay categorías globales (`user_id is null`) que el usuario
  // también puede leer, así que un mismo nombre puede traer dos filas —la
  // global y la propia— y `maybeSingle()` fallaría con PGRST116. Gana la
  // propia: si alguien se armó su "Comida", es a la que quiere imputar.
  const { data: existentes, error: errorLectura } = await supabase
    .from('categories')
    .select('id, user_id')
    .eq('name', limpio)
    .eq('type', tipo)

  if (errorLectura) return { categoriaId: null, error: errorLectura.message }

  if (existentes && existentes.length > 0) {
    const propia = existentes.find((c) => c.user_id === userId)
    return { categoriaId: (propia ?? existentes[0]).id as string, error: null }
  }

  const { data: creada, error: errorInsert } = await supabase
    .from('categories')
    .insert({ user_id: userId, name: limpio, type: tipo, icon: 'circle', color: '#64748B' })
    .select('id')
    .single()

  if (!errorInsert) return { categoriaId: creada.id as string, error: null }

  if (errorInsert.code === '23505') {
    const { data: reintento } = await supabase
      .from('categories')
      .select('id, user_id')
      .eq('name', limpio)
      .eq('type', tipo)

    const propia = reintento?.find((c) => c.user_id === userId) ?? reintento?.[0]
    return { categoriaId: (propia?.id as string) ?? null, error: null }
  }

  return { categoriaId: null, error: errorInsert.message }
}
