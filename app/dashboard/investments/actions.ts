'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CODIGOS_DE_MONEDA } from '@/lib/monedas'
import type { ResultadoGuardado } from '@/app/dashboard/actions'
import { FALTA_MIGRACION_INVERSIONES } from '@/lib/investments-service'
import { createClient } from '@/lib/supabase/server'

// Tiene que coincidir con el enum `public.asset_type`: TIME_DEPOSIT lo agrega
// la 016. Un valor de más acá rebota en la base con 22P02.
const TIPOS_DE_ACTIVO = [
  'MONEY_MARKET',
  'FIXED_INCOME',
  'STOCKS_CEDEARS',
  'CRYPTO',
  'TIME_DEPOSIT',
  'REAL_ESTATE',
] as const

const PLAZOS = ['T0', 'T1', 'T2', 'LOCKED'] as const

const inversionSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, 'Poné un nombre.').max(80),
  asset_type: z.enum(TIPOS_DE_ACTIVO),
  currency: z.enum(CODIGOS_DE_MONEDA),
  amount_invested: z
    .number()
    .refine(Number.isFinite, 'Poné un monto válido.')
    .min(0, 'El monto no puede ser negativo.'),
  /** Si no viene, vale lo mismo que se invirtió: recién comprado. */
  current_value: z
    .number()
    .refine(Number.isFinite, 'Poné un valor actual válido.')
    .min(0, 'El valor actual no puede ser negativo.')
    .nullable()
    .optional(),
  // La 016 amplió la columna a numeric(6,2); el mensaje evita el error críptico
  // de Postgres cuando se pasa del techo.
  expected_tna: z
    .number()
    .refine(Number.isFinite, 'Poné una TNA válida.')
    .min(0, 'La TNA no puede ser negativa.')
    .max(9999.99, 'La TNA no puede superar 9999,99 %.'),
  liquidity_term: z.enum(PLAZOS),
  /** Dónde está el activo. Opcional: la 016 la agrega como nullable. */
  broker_entity: z.string().trim().max(100).nullable().optional(),
})

export type InversionAGuardar = z.input<typeof inversionSchema>

function faltaLaTabla(codigo?: string): boolean {
  return codigo === 'PGRST205' || codigo === 'PGRST204' || codigo === '42P01' || codigo === '42703'
}

type ErrorDeSupabase = {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

/** Mismo criterio que en `accounts/actions`: el motivo real se muestra tal cual. */
function detalleDelError(error: ErrorDeSupabase): string {
  const partes = [error.message, error.details, error.hint].filter(Boolean)
  const cuerpo = partes.join(' · ') || 'error desconocido'
  return error.code ? `${cuerpo} [${error.code}]` : cuerpo
}

function causaConocida(codigo?: string): string | null {
  if (faltaLaTabla(codigo)) return FALTA_MIGRACION_INVERSIONES
  if (codigo === '42501') {
    return (
      'La base rechazó la escritura por una política de seguridad. ' +
      'Ejecutá migrations/006_investments_and_smart_spend.sql.'
    )
  }
  return null
}

export async function guardarInversion(entrada: InversionAGuardar): Promise<ResultadoGuardado> {
  const datos = inversionSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const fila = {
    user_id: user.id,
    name: datos.data.name,
    asset_type: datos.data.asset_type,
    currency: datos.data.currency,
    amount_invested: datos.data.amount_invested,
    // Recién cargada, una inversión vale lo que costó.
    current_value: datos.data.current_value ?? datos.data.amount_invested,
    expected_tna: datos.data.expected_tna,
    liquidity_term: datos.data.liquidity_term,
    broker_entity: datos.data.broker_entity || null,
  }

  const { error } = datos.data.id
    ? await supabase.from('investments').update(fila).eq('id', datos.data.id)
    : await supabase.from('investments').insert(fila)

  if (error) {
    const causa = causaConocida(error.code)
    if (causa) return { ok: false, error: `${causa} (${detalleDelError(error)})` }
    console.error('[guardarInversion]', error)
    return { ok: false, error: `No se pudo guardar la inversión: ${detalleDelError(error)}` }
  }

  revalidatePath('/dashboard/investments')
  revalidatePath('/dashboard/smart-spend')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function borrarInversion(id: string): Promise<ResultadoGuardado> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } = await supabase.from('investments').delete().eq('id', id)
  if (error) {
    console.error('[borrarInversion]', error)
    return { ok: false, error: `No se pudo borrar la inversión: ${detalleDelError(error)}` }
  }

  revalidatePath('/dashboard/investments')
  revalidatePath('/dashboard/smart-spend')
  revalidatePath('/dashboard')
  return { ok: true }
}
