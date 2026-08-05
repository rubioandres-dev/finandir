'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { guardarTransaccion } from '@/app/dashboard/actions'
import { CODIGOS_DE_MONEDA } from '@/lib/monedas'
import { FALTA_MIGRACION_COMPARTIDOS, repartir } from '@/lib/shared-expenses-service'
import { createClient } from '@/lib/supabase/server'

export type ResultadoCompartido = { ok: true } | { ok: false; error: string }

function faltaLaTabla(codigo?: string): boolean {
  return codigo === 'PGRST205' || codigo === 'PGRST204' || codigo === '42P01'
}

const espacioSchema = z.object({
  nombre: z.string().trim().min(1, 'Poné un nombre.').max(80, 'El nombre es muy largo.'),
  tipo: z.enum(['CONVIVENCIA', 'VIAJE', 'EVENTO']),
  moneda: z.enum(CODIGOS_DE_MONEDA),
})

/**
 * Crea un grupo y mete al creador como ADMIN.
 *
 * Son dos inserts y no hay transacción: PostgREST no las expone. Si el segundo
 * falla, queda un espacio sin miembros — invisible para todos, incluido su
 * creador, porque la policy de lectura de gastos pide membresía. Se borra el
 * espacio para no dejar basura.
 */
export async function crearEspacio(entrada: {
  nombre: string
  tipo: 'CONVIVENCIA' | 'VIAJE' | 'EVENTO'
  moneda: string
}): Promise<ResultadoCompartido> {
  const datos = espacioSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { data: espacio, error } = await supabase
    .from('shared_spaces')
    .insert({
      name: datos.data.nombre,
      type: datos.data.tipo,
      currency: datos.data.moneda,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !espacio) {
    if (faltaLaTabla(error?.code)) return { ok: false, error: FALTA_MIGRACION_COMPARTIDOS }
    return { ok: false, error: `No se pudo crear el grupo: ${error?.message}` }
  }

  const { error: errorMiembro } = await supabase.from('shared_space_members').insert({
    space_id: espacio.id,
    user_id: user.id,
    role: 'ADMIN',
  })

  if (errorMiembro) {
    await supabase.from('shared_spaces').delete().eq('id', espacio.id)
    return { ok: false, error: `No se pudo crear el grupo: ${errorMiembro.message}` }
  }

  revalidatePath('/dashboard/shared-expenses')
  redirect(`/dashboard/shared-expenses/${espacio.id}`)
}

/** Suma al usuario actual a un grupo. Idempotente: reentrar no duplica. */
export async function unirseAEspacio(spaceId: string): Promise<ResultadoCompartido> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } = await supabase
    .from('shared_space_members')
    .upsert({ space_id: spaceId, user_id: user.id, role: 'MEMBER' }, { onConflict: 'space_id,user_id' })

  if (error) {
    if (faltaLaTabla(error.code)) return { ok: false, error: FALTA_MIGRACION_COMPARTIDOS }
    return { ok: false, error: `No se pudo entrar al grupo: ${error.message}` }
  }

  revalidatePath('/dashboard/shared-expenses')
  return { ok: true }
}

const gastoSchema = z.object({
  spaceId: z.uuid(),
  pagadoPor: z.uuid(),
  monto: z.number().positive('El importe tiene que ser mayor a cero.'),
  descripcion: z.string().trim().min(1, 'Escribí una descripción.').max(120),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.'),
  repartos: z
    .array(z.object({ user_id: z.uuid(), percentage: z.number().min(0).max(100) }))
    .min(1, 'Tiene que haber al menos un participante.'),
})

export async function crearGastoCompartido(
  entrada: z.infer<typeof gastoSchema>
): Promise<ResultadoCompartido> {
  const datos = gastoSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const suma = datos.data.repartos.reduce((s, r) => s + r.percentage, 0)
  // Tolerancia de un décimo: los porcentajes se editan a mano y 33,3 × 3 = 99,9.
  if (Math.abs(suma - 100) > 0.5) {
    return { ok: false, error: `El reparto tiene que sumar 100%. Ahora suma ${suma.toFixed(1)}%.` }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { data: gasto, error } = await supabase
    .from('shared_transactions')
    .insert({
      space_id: datos.data.spaceId,
      paid_by: datos.data.pagadoPor,
      amount: datos.data.monto,
      description: datos.data.descripcion,
      date: datos.data.fecha,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !gasto) {
    if (faltaLaTabla(error?.code)) return { ok: false, error: FALTA_MIGRACION_COMPARTIDOS }
    return { ok: false, error: `No se pudo guardar: ${error?.message}` }
  }

  // El reparto se calcula en el servidor con el método del resto mayor: así la
  // suma de las partes es exactamente el total, sin centavos perdidos.
  const partes = repartir(datos.data.monto, datos.data.repartos)

  const { error: errorRepartos } = await supabase.from('shared_splits').insert(
    partes.map((p) => ({
      transaction_id: gasto.id,
      user_id: p.user_id,
      percentage: p.percentage,
      amount_owed: p.amount_owed,
    }))
  )

  if (errorRepartos) {
    // Un gasto sin repartos rompe todos los balances: se deshace.
    await supabase.from('shared_transactions').delete().eq('id', gasto.id)
    return { ok: false, error: `No se pudo guardar el reparto: ${errorRepartos.message}` }
  }

  revalidatePath(`/dashboard/shared-expenses/${datos.data.spaceId}`)
  return { ok: true }
}

// --- Calculadora de salidas --------------------------------------------------

const salidaSchema = z.object({
  total: z.number().positive(),
  miParte: z.number().positive(),
  descripcion: z.string().trim().min(1).max(120),
  moneda: z.enum(CODIGOS_DE_MONEDA),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  modo: z.enum(['TOTAL', 'SOLO_MI_PARTE']),
})

/**
 * Registra una salida pagada en grupo.
 *
 * LAS DOS OPCIONES NO SON LA MISMA CUENTA
 *
 * A) Pagué el total. Sale del banco el importe completo, pero tu gasto real es
 *    solo tu parte. La diferencia NO es un gasto tuyo: es plata que te deben.
 *    Se registra como gasto por el total y se crea una deuda a tu favor por el
 *    resto. Cuando te transfieran, cancelás esa deuda — y no entra como
 *    "ingreso", porque no ganaste nada: recuperaste lo tuyo. Contarlo como
 *    ingreso inflaría tu tasa de ahorro con plata que nunca fue tuya.
 *
 * B) Solo mi parte. Se registra el gasto por tu cuota y listo. Sirve cuando
 *    cada uno paga lo suyo en el momento.
 */
export async function registrarSalida(
  entrada: z.infer<typeof salidaSchema>
): Promise<ResultadoCompartido> {
  const datos = salidaSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const esSoloMiParte = datos.data.modo === 'SOLO_MI_PARTE'
  const importe = esSoloMiParte ? datos.data.miParte : datos.data.total

  const guardado = await guardarTransaccion({
    amount: importe,
    type: 'EXPENSE',
    currency: datos.data.moneda,
    category_suggested: 'Ocio',
    description: datos.data.descripcion,
    date: datos.data.fecha,
  })

  if (!guardado.ok) return { ok: false, error: guardado.error }

  // En la opción A, lo que pusiste de más queda como algo que te deben.
  const porCobrar = Math.round((datos.data.total - datos.data.miParte) * 100) / 100

  if (!esSoloMiParte && porCobrar > 0) {
    const { error } = await supabase.from('debts').insert({
      user_id: user.id,
      counterparty_name: datos.data.descripcion,
      total_amount: porCobrar,
      remaining_amount: porCobrar,
      currency: datos.data.moneda,
      type: 'OWED_TO_ME',
      description: 'Cuenta por cobrar de una salida compartida',
    })

    if (error) {
      // El gasto ya quedó registrado: avisar es más honesto que fingir que
      // salió todo bien, y que borrarlo dejando al usuario sin nada.
      return {
        ok: false,
        error: `El gasto se registró, pero no se pudo crear la cuenta por cobrar: ${error.message}`,
      }
    }
  }

  revalidatePath('/dashboard', 'layout')
  return { ok: true }
}
