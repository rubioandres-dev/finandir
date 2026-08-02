'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ResultadoGuardado } from '@/app/dashboard/actions'

const TIPOS = ['BANK', 'WALLET', 'CASH', 'INVESTMENT', 'CREDIT_CARD'] as const

const cuentaSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, 'Poné un nombre.').max(80),
    type: z.enum(TIPOS),
    currency: z.enum(['ARS', 'USD']),
    // Solo para tarjetas:
    closing_day: z.number().int().min(1).max(31).nullable().optional(),
    due_day: z.number().int().min(1).max(31).nullable().optional(),
    credit_limit: z.number().min(0).nullable().optional(),
    bank_name: z.string().trim().max(60).nullable().optional(),
    last_four_digits: z
      .string()
      .regex(/^\d{4}$/, 'Son 4 dígitos.')
      .nullable()
      .optional(),
  })
  .refine((d) => d.type !== 'CREDIT_CARD' || (d.closing_day != null && d.due_day != null), {
    message: 'La tarjeta necesita día de cierre y de vencimiento.',
    path: ['closing_day'],
  })

export type CuentaAGuardar = z.input<typeof cuentaSchema>

const FALTA_MIGRACION =
  'Falta el esquema de cuentas. Ejecutá migrations/003_accounts_cards_debts.sql.'

function esFaltaDeTabla(codigo?: string) {
  return codigo === 'PGRST205' || codigo === '42P01' || codigo === '42703'
}

export async function guardarCuenta(entrada: CuentaAGuardar): Promise<ResultadoGuardado> {
  const datos = cuentaSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const esTarjeta = datos.data.type === 'CREDIT_CARD'
  const fila = {
    user_id: user.id,
    name: datos.data.name,
    type: datos.data.type,
    currency: datos.data.currency,
    // Ni las tarjetas ni las inversiones cuentan como disponible.
    is_liquid: !esTarjeta && datos.data.type !== 'INVESTMENT',
  }

  const { data: cuenta, error } = datos.data.id
    ? await supabase.from('accounts').update(fila).eq('id', datos.data.id).select().single()
    : await supabase.from('accounts').insert(fila).select().single()

  if (error) {
    if (esFaltaDeTabla(error.code)) return { ok: false, error: FALTA_MIGRACION }
    if (error.code === '23505') return { ok: false, error: 'Ya tenés una cuenta con ese nombre.' }
    console.error('[guardarCuenta]', error)
    return { ok: false, error: 'No se pudo guardar la cuenta.' }
  }

  if (esTarjeta) {
    const { error: errorDetalle } = await supabase.from('credit_card_details').upsert(
      {
        account_id: cuenta.id,
        closing_day: datos.data.closing_day,
        due_day: datos.data.due_day,
        credit_limit: datos.data.credit_limit ?? null,
        bank_name: datos.data.bank_name || null,
        last_four_digits: datos.data.last_four_digits || null,
      },
      { onConflict: 'account_id' }
    )

    if (errorDetalle) {
      if (esFaltaDeTabla(errorDetalle.code)) return { ok: false, error: FALTA_MIGRACION }
      console.error('[guardarCuenta:detalle]', errorDetalle)
      return { ok: false, error: 'La cuenta se guardó pero fallaron los datos de la tarjeta.' }
    }
  }

  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function borrarCuenta(id: string): Promise<ResultadoGuardado> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { count } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', id)

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `La cuenta tiene ${count} movimientos. Borralos primero o dejá la cuenta como está.`,
    }
  }

  const { error } = await supabase.from('accounts').delete().eq('id', id)
  if (error) {
    console.error('[borrarCuenta]', error)
    return { ok: false, error: 'No se pudo borrar la cuenta.' }
  }

  revalidatePath('/dashboard/accounts')
  return { ok: true }
}

// --- Deudas ----------------------------------------------------------------

const deudaSchema = z.object({
  id: z.uuid().optional(),
  counterparty_name: z.string().trim().min(1, 'Poné con quién es la deuda.').max(80),
  total_amount: z.number().positive('El monto tiene que ser mayor a cero.'),
  remaining_amount: z.number().min(0).optional(),
  currency: z.enum(['ARS', 'USD']),
  type: z.enum(['OWED_BY_ME', 'OWED_TO_ME']),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  description: z.string().trim().max(200).nullable().optional(),
})

export type DeudaAGuardar = z.input<typeof deudaSchema>

export async function guardarDeuda(entrada: DeudaAGuardar): Promise<ResultadoGuardado> {
  const datos = deudaSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const pendiente = datos.data.remaining_amount ?? datos.data.total_amount
  if (pendiente > datos.data.total_amount) {
    return { ok: false, error: 'Lo pendiente no puede superar el total.' }
  }

  const fila = {
    user_id: user.id,
    counterparty_name: datos.data.counterparty_name,
    total_amount: datos.data.total_amount,
    remaining_amount: pendiente,
    currency: datos.data.currency,
    type: datos.data.type,
    due_date: datos.data.due_date || null,
    description: datos.data.description || null,
    is_settled: pendiente === 0,
  }

  const { error } = datos.data.id
    ? await supabase.from('debts').update(fila).eq('id', datos.data.id)
    : await supabase.from('debts').insert(fila)

  if (error) {
    if (esFaltaDeTabla(error.code)) return { ok: false, error: FALTA_MIGRACION }
    console.error('[guardarDeuda]', error)
    return { ok: false, error: 'No se pudo guardar la deuda.' }
  }

  revalidatePath('/dashboard/debts')
  return { ok: true }
}

/** Registra un pago parcial. Con `monto` >= pendiente, la marca saldada. */
export async function registrarPagoDeDeuda(
  id: string,
  monto: number
): Promise<ResultadoGuardado> {
  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: 'Ingresá un monto válido.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { data: deuda, error: errorLectura } = await supabase
    .from('debts')
    .select('remaining_amount')
    .eq('id', id)
    .single()

  if (errorLectura || !deuda) return { ok: false, error: 'No se encontró la deuda.' }

  const pendiente = Math.max(0, Number(deuda.remaining_amount) - monto)

  const { error } = await supabase
    .from('debts')
    .update({ remaining_amount: pendiente, is_settled: pendiente === 0 })
    .eq('id', id)

  if (error) {
    console.error('[registrarPagoDeDeuda]', error)
    return { ok: false, error: 'No se pudo registrar el pago.' }
  }

  revalidatePath('/dashboard/debts')
  return { ok: true }
}

export async function borrarDeuda(id: string): Promise<ResultadoGuardado> {
  const supabase = await createClient()
  const { error } = await supabase.from('debts').delete().eq('id', id)

  if (error) {
    console.error('[borrarDeuda]', error)
    return { ok: false, error: 'No se pudo borrar la deuda.' }
  }

  revalidatePath('/dashboard/debts')
  return { ok: true }
}
