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
 * nunca toca el saldo en pesos. La unicidad (user_id, currency) de
 * migrations/002 cubre la carrera entre dos requests simultáneos: el segundo
 * insert falla con 23505 y ahí releemos.
 */
export async function obtenerOCrearCuenta(
  supabase: SupabaseClient,
  userId: string,
  moneda: Moneda
): Promise<{ cuenta: Cuenta | null; error: string | null }> {
  const { data: existente, error: errorLectura } = await supabase
    .from('accounts')
    .select('*')
    .eq('currency', moneda)
    .maybeSingle()

  if (errorLectura) return { cuenta: null, error: errorLectura.message }
  if (existente) return { cuenta: existente as Cuenta, error: null }

  const { data: creada, error: errorInsert } = await supabase
    .from('accounts')
    .insert({ user_id: userId, name: nombreDeCuenta(moneda), currency: moneda })
    .select()
    .single()

  if (!errorInsert) return { cuenta: creada as Cuenta, error: null }

  if (errorInsert.code === '23505') {
    const { data: reintento, error: errorReintento } = await supabase
      .from('accounts')
      .select('*')
      .eq('currency', moneda)
      .single()

    if (errorReintento) return { cuenta: null, error: errorReintento.message }
    return { cuenta: reintento as Cuenta, error: null }
  }

  return { cuenta: null, error: errorInsert.message }
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

  const { data: existente, error: errorLectura } = await supabase
    .from('categories')
    .select('id')
    .eq('name', limpio)
    .eq('type', tipo)
    .maybeSingle()

  if (errorLectura) return { categoriaId: null, error: errorLectura.message }
  if (existente) return { categoriaId: existente.id as string, error: null }

  const { data: creada, error: errorInsert } = await supabase
    .from('categories')
    .insert({ user_id: userId, name: limpio, type: tipo, icon: 'circle', color: '#64748B' })
    .select('id')
    .single()

  if (!errorInsert) return { categoriaId: creada.id as string, error: null }

  if (errorInsert.code === '23505') {
    const { data: reintento } = await supabase
      .from('categories')
      .select('id')
      .eq('name', limpio)
      .eq('type', tipo)
      .maybeSingle()
    return { categoriaId: (reintento?.id as string) ?? null, error: null }
  }

  return { categoriaId: null, error: errorInsert.message }
}
