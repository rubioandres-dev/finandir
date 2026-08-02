'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { obtenerOCrearCategoria, obtenerOCrearCuentaPrincipal } from '@/lib/finanzas'
import { calcularMontoUsd, obtenerCotizacionDelDia } from '@/lib/rates'

export type ResultadoGuardado = { ok: true } | { ok: false; error: string }

const movimientoSchema = z.object({
  amount: z.number().positive('El importe tiene que ser mayor a cero.'),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  category_suggested: z.string().max(60),
  description: z.string().trim().min(1, 'Escribí una descripción.').max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.'),
})

export type MovimientoAGuardar = z.infer<typeof movimientoSchema>

export async function guardarTransaccion(
  entrada: MovimientoAGuardar
): Promise<ResultadoGuardado> {
  const datos = movimientoSchema.safeParse(entrada)
  if (!datos.success) {
    return { ok: false, error: datos.error.issues[0].message }
  }

  const supabase = await createClient()

  // Nunca confiar en un user_id que venga del cliente: se toma de la sesión.
  const {
    data: { user },
    error: errorAuth,
  } = await supabase.auth.getUser()

  if (errorAuth || !user) {
    return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }
  }

  const { cuenta, error: errorCuenta } = await obtenerOCrearCuentaPrincipal(supabase, user.id)
  if (errorCuenta || !cuenta) {
    return { ok: false, error: errorCuenta ?? 'No se pudo determinar la cuenta.' }
  }

  // El CHECK `transactions_transfer_has_no_category` obliga a que las
  // transferencias vayan sin categoría.
  let categoriaId: string | null = null
  if (datos.data.type !== 'TRANSFER') {
    const resultado = await obtenerOCrearCategoria(
      supabase,
      user.id,
      datos.data.category_suggested,
      datos.data.type
    )
    if (resultado.error) return { ok: false, error: resultado.error }
    categoriaId = resultado.categoriaId
  }

  // Congelamos el equivalente en USD al momento de guardar: con la inflación
  // argentina, reconvertir con la cotización de hoy falsearía el histórico.
  const cotizacion = await obtenerCotizacionDelDia(supabase)
  const montoUsd = calcularMontoUsd(datos.data.amount, datos.data.currency, cotizacion)

  const { error: errorInsert } = await supabase.from('transactions').insert({
    user_id: user.id,
    account_id: cuenta.id,
    category_id: categoriaId,
    amount: datos.data.amount,
    currency: datos.data.currency,
    amount_usd: montoUsd,
    type: datos.data.type,
    description: datos.data.description,
    date: datos.data.date,
  })

  if (errorInsert) {
    console.error('[guardarTransaccion]', errorInsert)
    return { ok: false, error: 'No se pudo guardar el movimiento. Intentá de nuevo.' }
  }

  revalidatePath('/dashboard')
  return { ok: true }
}

const presupuestoSchema = z.object({
  categoriaId: z.uuid('Categoría inválida.'),
  // null = quitar el presupuesto.
  monto: z.number().min(0, 'El presupuesto no puede ser negativo.').nullable(),
})

/** Define (o borra, con monto null) el presupuesto mensual de una categoría. */
export async function guardarPresupuesto(
  categoriaId: string,
  monto: number | null
): Promise<ResultadoGuardado> {
  const datos = presupuestoSchema.safeParse({ categoriaId, monto })
  if (!datos.success) {
    return { ok: false, error: datos.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } = await supabase
    .from('categories')
    .update({ monthly_budget: datos.data.monto })
    .eq('id', datos.data.categoriaId)

  if (error) {
    // 42703 = columna inexistente: falta correr la migración.
    if (error.code === '42703') {
      return {
        ok: false,
        error: 'Falta la columna monthly_budget. Ejecutá migrations/001_add_monthly_budget.sql.',
      }
    }
    console.error('[guardarPresupuesto]', error)
    return { ok: false, error: 'No se pudo guardar el presupuesto.' }
  }

  revalidatePath('/dashboard')
  return { ok: true }
}

export async function borrarTransaccion(id: string): Promise<ResultadoGuardado> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  // El RLS ya limita el borrado a las filas propias; el .eq es defensa extra.
  const { error } = await supabase.from('transactions').delete().eq('id', id)

  if (error) {
    console.error('[borrarTransaccion]', error)
    return { ok: false, error: 'No se pudo borrar el movimiento.' }
  }

  revalidatePath('/dashboard')
  return { ok: true }
}
