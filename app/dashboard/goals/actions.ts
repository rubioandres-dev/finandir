'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
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
import { libroDelServidor } from '@/lib/almacen/acceso'
import { guardarPerfil } from '@/lib/profile-service'
import { codigoDeError } from '@/lib/almacen/tipos'
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

/**
 * Crea o actualiza un objetivo.
 *
 * ES UNA SOLA MUTACION PARA LOS CINCO TIPOS
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

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  let guardado: Objetivo | null = null

  try {
    await (await libroDelServidor(supabase, user.id)).mutar('objetivos', (objetivos) => {
      // El upsert por la clave unica (user_id, type, category_id) se vuelve
      // "buscar por tipo y reemplazar". La busqueda va ADENTRO: si otro
      // dispositivo creo el mismo objetivo en el medio, el reintento lo
      // encuentra y lo pisa en vez de chocar contra la restriccion.
      const previo = objetivos.find(
        (o) => o.type === datos.data.tipo && o.category_id === null
      )

      const objetivo: Objetivo = {
        id: previo?.id ?? crypto.randomUUID(),
        type: datos.data.tipo,
        target_value: datos.data.valor,
        current_value: previo?.current_value ?? 0,
        period: previo?.period ?? 'MONTHLY',
        currency: datos.data.moneda,
        // Desde la 013 ningún tipo vigente usa categoría: los presupuestos
        // viven en `category_budgets`.
        category_id: null,
        achieved_at: previo?.achieved_at ?? null,
        is_active: true,
      }

      guardado = objetivo

      return previo
        ? objetivos.map((o) => (o.id === previo.id ? objetivo : o))
        : [...objetivos, objetivo]
    })
  } catch (error) {
    const codigo = codigoDeError(error)
    if (faltaLaTabla(codigo)) return { ok: false, error: FALTA_MIGRACION_OBJETIVOS }
    if (faltaLaRestriccionUnica(codigo)) {
      return { ok: false, error: FALTA_RESTRICCION_UNICA }
    }
    const detalle = error instanceof Error ? error.message : 'Error desconocido.'
    return { ok: false, error: `No se pudo guardar: ${detalle}` }
  }

  if (!guardado) return { ok: false, error: 'No se pudo guardar el objetivo.' }

  revalidatePath('/dashboard/goals')
  // Los presupuestos del Home salen de estos objetivos: sin esto, la meta
  // nueva no aparece hasta la próxima navegación completa.
  revalidatePath('/dashboard')

  return { ok: true, objetivo: guardado }
}

export async function borrarObjetivo(id: string): Promise<ResultadoSimple> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  try {
    await (await libroDelServidor(supabase, user.id)).mutar('objetivos', (objetivos) =>
      objetivos.filter((o) => o.id !== id)
    )
  } catch (error) {
    const detalle = error instanceof Error ? error.message : 'Error desconocido.'
    return { ok: false, error: `No se pudo borrar: ${detalle}` }
  }

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

  const pedidos = new Set(idsCumplidos)
  let marcados = 0

  try {
    await (await libroDelServidor(supabase, user.id)).mutar('objetivos', (objetivos) => {
      // Solo los que TODAVIA no tienen fecha de logro, decidido adentro: la
      // funcion es idempotente y la corre cada render, asi que preguntar afuera
      // marcaria dos veces el mismo logro si dos pestañas renderizan a la vez.
      const nuevos = objetivos.filter((o) => pedidos.has(o.id) && o.achieved_at === null)
      marcados = nuevos.length
      if (marcados === 0) return objetivos

      const ahora = new Date().toISOString()
      return objetivos.map((o) =>
        pedidos.has(o.id) && o.achieved_at === null ? { ...o, achieved_at: ahora } : o
      )
    })
  } catch (error) {
    console.error('[goals] no se pudo marcar el logro', error)
    return null
  }

  if (marcados === 0) return null


  const perfil = await (await libroDelServidor(supabase, user.id)).leer('perfil')

  const xpSumado = marcados * XP_POR_LOGRO
  const xpTotal = Number(perfil?.aurem_xp ?? 0) + xpSumado
  const tier = tierPara(xpTotal)

  const resultado = await guardarPerfil(await libroDelServidor(supabase, user.id), {
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
