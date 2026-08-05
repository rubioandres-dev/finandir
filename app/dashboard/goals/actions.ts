'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  FALTA_MIGRACION_OBJETIVOS,
  TIPOS_DE_OBJETIVO,
  XP_POR_LOGRO,
  tierPara,
} from '@/lib/goals-service'
import { CODIGOS_DE_MONEDA } from '@/lib/monedas'
import { guardarPerfil } from '@/lib/profile-service'
import { createClient } from '@/lib/supabase/server'

export type ResultadoDeObjetivo = { ok: true } | { ok: false; error: string }

const objetivoSchema = z.object({
  tipo: z.enum(TIPOS_DE_OBJETIVO),
  valor: z.number().positive('La meta tiene que ser mayor a cero.'),
  moneda: z.enum(CODIGOS_DE_MONEDA).default('ARS'),
  categoriaId: z.uuid().nullable().optional(),
})

export type ObjetivoAGuardar = z.infer<typeof objetivoSchema>

function faltaLaTabla(codigo?: string): boolean {
  return codigo === 'PGRST205' || codigo === 'PGRST204' || codigo === '42P01'
}

/**
 * Crea o actualiza un objetivo.
 *
 * Es un upsert sobre los índices únicos de la 010: uno por tipo, y uno por
 * categoría en los de presupuesto. Volver a guardar el mismo tipo cambia la
 * meta en vez de crear un duplicado, que es lo que el formulario espera.
 */
export async function guardarObjetivo(
  entrada: ObjetivoAGuardar
): Promise<ResultadoDeObjetivo> {
  const datos = objetivoSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  if (datos.data.tipo === 'CATEGORY_BUDGET' && !datos.data.categoriaId) {
    return { ok: false, error: 'Elegí la categoría del presupuesto.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } = await supabase.from('financial_goals').upsert(
    {
      user_id: user.id,
      type: datos.data.tipo,
      target_value: datos.data.valor,
      currency: datos.data.moneda,
      category_id: datos.data.categoriaId ?? null,
      is_active: true,
    },
    {
      onConflict:
        datos.data.tipo === 'CATEGORY_BUDGET' ? 'user_id,category_id' : 'user_id,type',
    }
  )

  if (error) {
    if (faltaLaTabla(error.code)) return { ok: false, error: FALTA_MIGRACION_OBJETIVOS }
    return { ok: false, error: `No se pudo guardar: ${error.message}` }
  }

  revalidatePath('/dashboard/goals')
  return { ok: true }
}

export async function borrarObjetivo(id: string): Promise<ResultadoDeObjetivo> {
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
