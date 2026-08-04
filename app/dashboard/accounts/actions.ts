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
    /**
     * Saldo de apertura al crear, o corrección del saldo al editar. Si no
     * viene, la columna no se toca: la mantienen los triggers de transactions.
     * En una tarjeta es negativo, porque ese negativo es la deuda.
     */
    balance: z
      .number()
      .refine(Number.isFinite, 'Poné un saldo válido.')
      .nullable()
      .optional(),
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

const FALTA_POLITICA =
  'La base rechazó la escritura por una política de seguridad. ' +
  'Ejecutá migrations/005_rls_tarjetas_deudas.sql.'

/**
 * Códigos que significan "el esquema no está al día".
 *
 * PGRST204 es el que más engaña: la columna existe en la base pero no en el
 * cache de PostgREST. Faltaba en esta lista y caía en el error genérico.
 */
function esFaltaDeEsquema(codigo?: string) {
  return (
    codigo === 'PGRST204' ||
    codigo === 'PGRST205' ||
    codigo === '42P01' ||
    codigo === '42703'
  )
}

/**
 * Causa accionable del rechazo, o null si no la reconocemos.
 *
 * 42501 es RLS: la tabla tiene la seguridad activa y ninguna política que
 * aplique, o una que no coincide. El texto de Postgres ("new row violates
 * row-level security policy") no le dice a nadie qué hacer, y el problema
 * nunca está en el dato que cargó el usuario sino en la base.
 */
function causaConocida(codigo?: string): string | null {
  if (esFaltaDeEsquema(codigo)) return FALTA_MIGRACION
  if (codigo === '42501') return FALTA_POLITICA
  return null
}

type ErrorDeSupabase = {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

/**
 * Texto con el motivo real del rechazo.
 *
 * Tragarse el error de Postgres detrás de un "no se pudo guardar" dejaba al
 * usuario sin ninguna pista de qué corregir; acá se muestra tal cual.
 */
function detalleDelError(error: ErrorDeSupabase): string {
  const partes = [error.message, error.details, error.hint].filter(Boolean)
  const cuerpo = partes.join(' · ') || 'error desconocido'
  return error.code ? `${cuerpo} [${error.code}]` : cuerpo
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
  const esAlta = !datos.data.id

  const fila: Record<string, unknown> = {
    user_id: user.id,
    name: datos.data.name,
    type: datos.data.type,
    currency: datos.data.currency,
    // Ni las tarjetas ni las inversiones cuentan como disponible.
    is_liquid: !esTarjeta && datos.data.type !== 'INVESTMENT',
  }
  // Solo se escribe si el formulario lo mandó: así editar el nombre no pisa
  // un saldo que los triggers pudieron mover mientras tanto.
  if (datos.data.balance != null) fila.balance = datos.data.balance

  const { data: cuenta, error } = esAlta
    ? await supabase.from('accounts').insert(fila).select('id').single()
    : await supabase.from('accounts').update(fila).eq('id', datos.data.id!).select('id').single()

  if (error) {
    const causa = causaConocida(error.code)
    if (causa) return { ok: false, error: `${causa} (${detalleDelError(error)})` }
    if (error.code === '23505') return { ok: false, error: 'Ya tenés una cuenta con ese nombre.' }
    console.error('[guardarCuenta]', error)
    return { ok: false, error: `No se pudo guardar la cuenta: ${detalleDelError(error)}` }
  }

  if (!cuenta) {
    return { ok: false, error: 'No se encontró la cuenta que querés editar.' }
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
      // Un alta a medias es peor que ninguna: dejaba una cuenta con el nombre
      // y nada más, imposible de completar porque el nombre ya estaba tomado.
      if (esAlta) await supabase.from('accounts').delete().eq('id', cuenta.id)

      console.error('[guardarCuenta:detalle]', errorDetalle)
      const motivo =
        causaConocida(errorDetalle.code) ?? 'No se pudieron guardar los datos de la tarjeta'
      return {
        ok: false,
        error: `${motivo}: ${detalleDelError(errorDetalle)}${
          esAlta ? '. No se creó la cuenta.' : ''
        }`,
      }
    }
  } else if (!esAlta) {
    // Dejó de ser tarjeta: el detalle viejo ya no describe nada.
    await supabase.from('credit_card_details').delete().eq('account_id', cuenta.id)
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
    return { ok: false, error: `No se pudo borrar la cuenta: ${detalleDelError(error)}` }
  }

  revalidatePath('/dashboard/accounts')
  revalidatePath('/dashboard')
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
    const causa = causaConocida(error.code)
    if (causa) return { ok: false, error: `${causa} (${detalleDelError(error)})` }
    console.error('[guardarDeuda]', error)
    return { ok: false, error: `No se pudo guardar la deuda: ${detalleDelError(error)}` }
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
