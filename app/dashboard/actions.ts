'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { obtenerOCrearCategoria, obtenerOCrearCuenta } from '@/lib/finanzas'
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

  const { cuenta, error: errorCuenta } = await obtenerOCrearCuenta(
    supabase,
    user.id,
    datos.data.currency
  )
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
  moneda: z.enum(['ARS', 'USD']),
  // null = quitar el presupuesto de esa moneda.
  monto: z.number().min(0, 'El presupuesto no puede ser negativo.').nullable(),
})

const FALTA_TABLA =
  'Falta la tabla budgets. Ejecutá migrations/002_multi_moneda.sql en el SQL Editor.'

/**
 * Define (o borra, con monto null) el presupuesto mensual de una categoría
 * en una moneda. Cada moneda lleva su propio límite y se compara solo contra
 * los gastos de esa misma moneda.
 */
export async function guardarPresupuesto(
  categoriaId: string,
  moneda: 'ARS' | 'USD',
  monto: number | null
): Promise<ResultadoGuardado> {
  const datos = presupuestoSchema.safeParse({ categoriaId, moneda, monto })
  if (!datos.success) {
    return { ok: false, error: datos.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } =
    datos.data.monto === null
      ? await supabase
          .from('budgets')
          .delete()
          .eq('category_id', datos.data.categoriaId)
          .eq('currency', datos.data.moneda)
      : await supabase.from('budgets').upsert(
          {
            user_id: user.id,
            category_id: datos.data.categoriaId,
            currency: datos.data.moneda,
            amount: datos.data.monto,
          },
          { onConflict: 'category_id,currency' }
        )

  if (error) {
    // PGRST205 = la tabla no existe todavía en el esquema.
    if (error.code === 'PGRST205' || error.code === '42P01') {
      return { ok: false, error: FALTA_TABLA }
    }
    console.error('[guardarPresupuesto]', error)
    return { ok: false, error: 'No se pudo guardar el presupuesto.' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/settings')
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
