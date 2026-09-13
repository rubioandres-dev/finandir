'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { libroDelServidor } from '@/lib/almacen/acceso'
import { codigoDeError } from '@/lib/almacen/tipos'
import { createClient } from '@/lib/supabase/server'

/** Senal interna: ya hay una categoria con ese nombre y tipo. */
const DUPLICADA = 'categoria-duplicada'

export type ResultadoDeCategoria = { ok: true } | { ok: false; error: string }

const categoriaSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'Poné un nombre.')
    .max(60, 'El nombre no puede pasar de 60 caracteres.'),
  tipo: z.enum(['INCOME', 'EXPENSE']),
  icono: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'El color tiene que ser #RRGGBB.'),
})

export type CategoriaAGuardar = z.infer<typeof categoriaSchema>

/** 23505 = unique violation; PGRST204/42703 = falta la columna is_custom. */
function faltaLaMigracion(codigo?: string): boolean {
  return codigo === 'PGRST204' || codigo === '42703'
}

/**
 * Crea una categoría personalizada.
 *
 * `is_custom` va explícito aunque el default de la 008 ya sea `true`: si la
 * migración no está corrida, el insert falla acá con un mensaje claro en vez
 * de crear una categoría que la UI después no puede distinguir de las del
 * sistema.
 */
export async function crearCategoria(
  entrada: CategoriaAGuardar
): Promise<ResultadoDeCategoria> {
  const datos = categoriaSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  try {
    await (await libroDelServidor(supabase, user.id)).mutar('categorias', (categorias) => {
      // El duplicado se chequea ADENTRO: era el 23505 que se atrapaba despues
      // del insert, y ahora lo cubre el lazo de reintentos si otro dispositivo
      // crea la misma categoria en el medio.
      const repetida = categorias.some(
        (c) =>
          c.user_id === user.id &&
          c.type === datos.data.tipo &&
          c.name.trim().toLowerCase() === datos.data.nombre.trim().toLowerCase()
      )
      if (repetida) throw new Error(DUPLICADA)

      return [
        ...categorias,
        {
          id: crypto.randomUUID(),
          user_id: user.id,
          name: datos.data.nombre,
          type: datos.data.tipo,
          icon: datos.data.icono,
          color: datos.data.color,
          is_custom: true,
          presupuestos: [],
        },
      ]
    })
  } catch (error) {
    if (error instanceof Error && error.message === DUPLICADA) {
      return { ok: false, error: `Ya tenés una categoría "${datos.data.nombre}" de ese tipo.` }
    }
    if (faltaLaMigracion(codigoDeError(error))) {
      return {
        ok: false,
        error: 'Falta correr migrations/008_custom_categories.sql en el SQL Editor de Supabase.',
      }
    }
    const detalle = error instanceof Error ? error.message : 'Error desconocido.'
    return { ok: false, error: `No se pudo crear: ${detalle}` }
  }

  revalidatePath('/dashboard', 'layout')
  return { ok: true }
}

/** Renombra o recolorea una categoría propia. Las del sistema no se tocan. */
export async function actualizarCategoria(
  id: string,
  entrada: CategoriaAGuardar
): Promise<ResultadoDeCategoria> {
  const datos = categoriaSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  try {
    await (await libroDelServidor(supabase, user.id)).mutar('categorias', (categorias) => {
      const repetida = categorias.some(
        (c) =>
          c.id !== id &&
          c.user_id === user.id &&
          c.type === datos.data.tipo &&
          c.name.trim().toLowerCase() === datos.data.nombre.trim().toLowerCase()
      )
      if (repetida) throw new Error(DUPLICADA)

      return categorias.map((c) =>
        // La comparacion de dueno es explicita: una categoria del sistema no se
        // edita, y sin esto el cambio pasaria en silencio.
        c.id === id && c.user_id === user.id
          ? {
              ...c,
              name: datos.data.nombre,
              type: datos.data.tipo,
              icon: datos.data.icono,
              color: datos.data.color,
            }
          : c
      )
    })
  } catch (error) {
    if (error instanceof Error && error.message === DUPLICADA) {
      return { ok: false, error: `Ya tenés una categoría "${datos.data.nombre}" de ese tipo.` }
    }
    const detalle = error instanceof Error ? error.message : 'Error desconocido.'
    return { ok: false, error: `No se pudo guardar: ${detalle}` }
  }

  revalidatePath('/dashboard', 'layout')
  return { ok: true }
}

/**
 * Borra una categoría propia.
 *
 * `transactions.category_id` es `on delete set null`, así que los movimientos
 * no se pierden: quedan sin categoría. Igual se avisa antes en la UI, porque
 * "quedan sin categoría" no es lo que la gente espera de un botón de borrar.
 */
export async function borrarCategoria(id: string): Promise<ResultadoDeCategoria> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  try {
    await (await libroDelServidor(supabase, user.id)).mutar('categorias', (categorias) =>
      categorias.filter((c) => !(c.id === id && c.user_id === user.id))
    )
  } catch (error) {
    const detalle = error instanceof Error ? error.message : 'Error desconocido.'
    return { ok: false, error: `No se pudo borrar: ${detalle}` }
  }

  revalidatePath('/dashboard', 'layout')
  return { ok: true }
}
