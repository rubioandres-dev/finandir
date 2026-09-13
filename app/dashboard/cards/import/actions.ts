'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CODIGOS_DE_MONEDA } from '@/lib/monedas'
import type { ResultadoGuardado } from '@/app/dashboard/actions'
import { obtenerOCrearCategoria } from '@/lib/finanzas'
import { calcularMontoUsd, obtenerCotizacionDelDia } from '@/lib/rates'
import {
  conciliar,
  type ConsumoConciliado,
  type ConsumoImportado,
  type MovimientoExistente,
} from '@/lib/reconciliation-service'
import { libroDelServidor } from '@/lib/almacen/acceso'
import type { Transaccion } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'

const consumoSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(120),
  amount: z.number().positive(),
  current_installment: z.number().int().min(1).nullable(),
  total_installments: z.number().int().min(1).nullable(),
  currency: z.enum(CODIGOS_DE_MONEDA),
})

const listaSchema = z.array(consumoSchema).min(1).max(500)

/** Ventana de búsqueda alrededor de los consumos, para no traer toda la tabla. */
const DIAS_DE_MARGEN = 10

function correrFecha(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Compara los consumos del resumen contra lo ya guardado.
 *
 * Corre en el servidor porque necesita leer la base con la sesión del usuario.
 */
export async function conciliarConsumos(
  consumos: ConsumoImportado[]
): Promise<
  { ok: true; resultado: ConsumoConciliado[] } | { ok: false; error: string }
> {
  const datos = listaSchema.safeParse(consumos)
  if (!datos.success) {
    return { ok: false, error: 'Los consumos del resumen no tienen el formato esperado.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const fechas = datos.data.map((c) => c.date).sort()
  const desde = correrFecha(fechas[0], -DIAS_DE_MARGEN)
  const hasta = correrFecha(fechas[fechas.length - 1], DIAS_DE_MARGEN)

  let data
  try {
    data = await (await libroDelServidor(supabase)).movimientos(desde, hasta)
  } catch (error) {
    console.error('[conciliarConsumos]', error)
    return { ok: false, error: 'No se pudieron leer los movimientos existentes.' }
  }

  return {
    ok: true,
    resultado: conciliar(datos.data, (data ?? []) as MovimientoExistente[]),
  }
}

const importarSchema = z.object({
  consumos: listaSchema,
  accountId: z.uuid('Elegí la tarjeta del resumen.'),
  categoria: z.string().trim().min(1).max(60).default('Otros'),
})

/**
 * Guarda los consumos elegidos como movimientos.
 *
 * Cada renglón se guarda como un gasto individual con su propia fecha: los
 * renglones de un plan de cuotas ya vienen desagregados en el resumen, así que
 * NO se vuelve a generar el plan (eso duplicaría las cuotas futuras).
 */
export async function importarConsumos(
  consumos: ConsumoImportado[],
  accountId: string,
  categoria = 'Otros'
): Promise<ResultadoGuardado & { importados?: number }> {
  const datos = importarSchema.safeParse({ consumos, accountId, categoria })
  if (!datos.success) {
    return { ok: false, error: datos.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const libro = await libroDelServidor(supabase, user.id)

  const cuenta = (await libro.leer('cuentas')).find((c) => c.id === datos.data.accountId)
  if (!cuenta) return { ok: false, error: 'No se encontró la tarjeta elegida.' }

  const monedaDeCuenta = cuenta.currency.trim()
  const incompatibles = datos.data.consumos.filter((c) => c.currency !== monedaDeCuenta)
  if (incompatibles.length > 0) {
    return {
      ok: false,
      error: `${incompatibles.length} consumo(s) están en otra moneda que la tarjeta (${monedaDeCuenta}). Importalos por separado.`,
    }
  }

  const { categoriaId, error: errorCategoria } = await obtenerOCrearCategoria(
    await libroDelServidor(supabase, user.id),
    user.id,
    datos.data.categoria,
    'EXPENSE'
  )
  if (errorCategoria) return { ok: false, error: errorCategoria }

  const cotizacion = await obtenerCotizacionDelDia(supabase)

  const ahora = new Date().toISOString()

  const movimientos: Transaccion[] = datos.data.consumos.map((consumo) => ({
    id: crypto.randomUUID(),
    user_id: user.id,
    account_id: cuenta.id,
    category_id: categoriaId,
    amount: consumo.amount,
    currency: consumo.currency,
    amount_usd: calcularMontoUsd(consumo.amount, consumo.currency, cotizacion),
    type: 'EXPENSE',
    description: consumo.description,
    date: consumo.date,
    created_at: ahora,
    // El resumen ya trae cada cuota como un renglón propio: se conserva la
    // numeración pero no se genera el plan completo, asi que ninguna apunta a
    // una madre.
    installment_current: consumo.current_installment,
    installment_total: consumo.total_installments,
    parent_transaction_id: null,
    has_interest: false,
    cash_price: null,
    total_financed_amount: null,
    installment_amount: null,
  }))

  try {
    await libro.agregarMovimientos(movimientos)
  } catch (error) {
    console.error('[importarConsumos]', error)
    return { ok: false, error: 'No se pudieron guardar los movimientos.' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard/commitments')
  return { ok: true, importados: movimientos.length }
}
