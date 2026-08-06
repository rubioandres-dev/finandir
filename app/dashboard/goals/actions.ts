'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  CLAVE_UNICA_DE_OBJETIVO,
  FALTA_MIGRACION_OBJETIVOS,
  FALTA_RESTRICCION_UNICA,
  TIPOS_DE_OBJETIVO,
  XP_POR_LOGRO,
  faltaLaRestriccionUnica,
  faltaLaTabla,
  tierPara,
  type Objetivo,
} from '@/lib/goals-service'
import { CODIGOS_DE_MONEDA } from '@/lib/monedas'
import { guardarPerfil } from '@/lib/profile-service'
import { createClient } from '@/lib/supabase/server'

/**
 * El éxito devuelve la fila guardada.
 *
 * Los formularios de hoy sólo miran `ok`, pero el upsert es la única operación
 * que sabe si terminó siendo un alta o una edición, y devolver el `id` real
 * evita que quien llame tenga que releerlo. Ensanchar la rama de éxito es
 * compatible: `if (!resultado.ok)` sigue compilando igual.
 */
export type ResultadoDeObjetivo =
  | { ok: true; objetivo: Objetivo }
  | { ok: false; error: string }

/** Para las operaciones que no devuelven una fila, como el borrado. */
export type ResultadoSimple = { ok: true } | { ok: false; error: string }

const objetivoSchema = z.object({
  tipo: z.enum(TIPOS_DE_OBJETIVO),
  valor: z.number().positive('La meta tiene que ser mayor a cero.'),
  moneda: z.enum(CODIGOS_DE_MONEDA).default('ARS'),
  categoriaId: z.uuid().nullable().optional(),
})

export type ObjetivoAGuardar = z.infer<typeof objetivoSchema>

/** Las columnas que se leen de vuelta: las mismas que arma `Objetivo`. */
const COLUMNAS_DE_OBJETIVO =
  'id, type, target_value, current_value, period, currency, category_id, achieved_at, is_active'

/**
 * Crea o actualiza un objetivo.
 *
 * ES UN SOLO UPSERT PARA LOS CINCO TIPOS
 *
 * Antes el `onConflict` se elegía según el tipo —`user_id,category_id` para
 * presupuestos y `user_id,type` para el resto— porque la 010 había creado dos
 * índices únicos PARCIALES. Ninguna de las dos variantes funcionaba: un índice
 * parcial sólo sirve para `ON CONFLICT` si la sentencia repite su predicado, y
 * PostgREST no tiene forma de emitirlo. De ahí el 42P10 "no unique or exclusion
 * constraint matching the ON CONFLICT specification" en cada guardado.
 *
 * La 012 reemplaza los dos índices por una restricción TOTAL sobre
 * `(user_id, type, category_id)` con `NULLS NOT DISTINCT`, que expresa la misma
 * regla y sí se puede nombrar desde acá. Por eso ahora hay una sola clave y no
 * un condicional.
 *
 * LO QUE EL UPSERT NO PISA
 *
 * El payload lleva sólo las columnas que el formulario edita. `ON CONFLICT DO
 * UPDATE` toca únicamente esas, así que `current_value`, `achieved_at` y
 * `created_at` sobreviven a una edición: volver a guardar la meta no borra el
 * logro ya conseguido, que es la regla central del módulo.
 */
export async function guardarObjetivo(
  entrada: ObjetivoAGuardar
): Promise<ResultadoDeObjetivo> {
  const datos = objetivoSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  if (datos.data.tipo === 'CATEGORY_BUDGET' && !datos.data.categoriaId) {
    return { ok: false, error: 'Elegí la categoría del presupuesto.' }
  }

  // Una categoría en un objetivo que no es de presupuesto rompería la clave
  // única sin que se note: dos metas de tasa de ahorro con categorías
  // distintas serían dos filas legales para una regla que dice "una sola".
  const categoriaId =
    datos.data.tipo === 'CATEGORY_BUDGET' ? (datos.data.categoriaId ?? null) : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { data, error } = await supabase
    .from('financial_goals')
    .upsert(
      {
        user_id: user.id,
        type: datos.data.tipo,
        target_value: datos.data.valor,
        currency: datos.data.moneda,
        category_id: categoriaId,
        is_active: true,
      },
      { onConflict: CLAVE_UNICA_DE_OBJETIVO, ignoreDuplicates: false }
    )
    .select(COLUMNAS_DE_OBJETIVO)
    .single()

  if (error) {
    if (faltaLaTabla(error.code)) return { ok: false, error: FALTA_MIGRACION_OBJETIVOS }
    // El error que traía a esta función acá. Se nombra la migración en vez de
    // devolver el mensaje crudo de Postgres, que no le dice nada a nadie.
    if (faltaLaRestriccionUnica(error.code)) {
      return { ok: false, error: FALTA_RESTRICCION_UNICA }
    }
    return { ok: false, error: `No se pudo guardar: ${error.message}` }
  }

  revalidatePath('/dashboard/goals')
  // Los presupuestos del Home salen de estos objetivos: sin esto, la meta
  // nueva no aparece hasta la próxima navegación completa.
  revalidatePath('/dashboard')

  return {
    ok: true,
    objetivo: {
      ...data,
      target_value: Number(data.target_value),
      current_value: Number(data.current_value),
    } as Objetivo,
  }
}

export async function borrarObjetivo(id: string): Promise<ResultadoSimple> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } = await supabase
    .from('financial_goals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: `No se pudo borrar: ${error.message}` }

  revalidatePath('/dashboard/goals')
  return { ok: true }
}

/**
 * Registra los objetivos que se cumplieron y suma su XP.
 *
 * SOLO SUMA, NUNCA RESTA. Un objetivo que ya tiene `achieved_at` se saltea, y
 * uno que dejó de cumplirse no se desmarca: el XP reconoce que algo se logró,
 * no que se sostiene. Dejar que baje convertiría el tier en una nota mensual,
 * que es justo lo que el módulo evita.
 *
 * La llama la página al renderizar, con los objetivos ya medidos. Es
 * idempotente: si no hay nada nuevo que marcar, no escribe.
 */
export async function registrarLogros(
  idsCumplidos: string[]
): Promise<{ xpSumado: number; tier: string } | null> {
  if (idsCumplidos.length === 0) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Solo los que todavía no tienen fecha de logro.
  const { data: nuevos, error: errorLectura } = await supabase
    .from('financial_goals')
    .select('id')
    .in('id', idsCumplidos)
    .eq('user_id', user.id)
    .is('achieved_at', null)

  if (errorLectura || !nuevos || nuevos.length === 0) return null

  const ids = nuevos.map((f) => f.id as string)

  const { error: errorMarca } = await supabase
    .from('financial_goals')
    .update({ achieved_at: new Date().toISOString() })
    .in('id', ids)
    .eq('user_id', user.id)

  if (errorMarca) {
    console.error('[goals] no se pudo marcar el logro', errorMarca.message)
    return null
  }

  const { data: perfil } = await supabase
    .from('user_profiles')
    .select('aurem_xp')
    .eq('user_id', user.id)
    .maybeSingle()

  const xpSumado = ids.length * XP_POR_LOGRO
  const xpTotal = Number(perfil?.aurem_xp ?? 0) + xpSumado
  const tier = tierPara(xpTotal)

  const resultado = await guardarPerfil(supabase, user.id, {
    aurem_xp: xpTotal,
    aurem_tier: tier.codigo,
  })

  if (!resultado.ok) {
    console.error('[goals] no se pudo guardar el XP', resultado.error)
    return null
  }

  revalidatePath('/dashboard', 'layout')
  return { xpSumado, tier: tier.codigo }
}
