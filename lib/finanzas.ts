import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cuenta, TipoCategoria } from './types'

export const NOMBRE_CUENTA_POR_DEFECTO = 'Principal'

/**
 * Devuelve la primera cuenta del usuario y, si no tiene ninguna, crea
 * "Principal".
 *
 * La unicidad (user_id, name) de schema.sql cubre la carrera entre dos
 * requests simultáneos: el segundo insert falla con 23505 y ahí releemos.
 */
export async function obtenerOCrearCuentaPrincipal(
  supabase: SupabaseClient,
  userId: string
): Promise<{ cuenta: Cuenta | null; error: string | null }> {
  const { data: existentes, error: errorLectura } = await supabase
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)

  if (errorLectura) return { cuenta: null, error: errorLectura.message }
  if (existentes && existentes.length > 0) {
    return { cuenta: existentes[0] as Cuenta, error: null }
  }

  const { data: creada, error: errorInsert } = await supabase
    .from('accounts')
    .insert({ user_id: userId, name: NOMBRE_CUENTA_POR_DEFECTO, currency: 'ARS' })
    .select()
    .single()

  if (!errorInsert) return { cuenta: creada as Cuenta, error: null }

  // 23505 = unique_violation: otro request la creó primero.
  if (errorInsert.code === '23505') {
    const { data: reintento, error: errorReintento } = await supabase
      .from('accounts')
      .select('*')
      .eq('name', NOMBRE_CUENTA_POR_DEFECTO)
      .single()

    if (errorReintento) return { cuenta: null, error: errorReintento.message }
    return { cuenta: reintento as Cuenta, error: null }
  }

  return { cuenta: null, error: errorInsert.message }
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
