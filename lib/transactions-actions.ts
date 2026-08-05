'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { guardarTransaccion, type ResultadoGuardado } from '@/app/dashboard/actions'
import { obtenerOCrearCategoria } from '@/lib/finanzas'
import { calcularMontoUsd, obtenerCotizacionDelDia } from '@/lib/rates'
import { createClient } from '@/lib/supabase/server'
import type { Moneda } from '@/lib/types'

/**
 * Editar y borrar movimientos.
 *
 * EL SALDO NO SE TOCA A MANO. El trigger `transactions_apply_balance` de
 * schema.sql corre `after insert or update or delete` y en UPDATE/DELETE
 * revierte el delta de la fila vieja antes de aplicar la nueva. Verificado en
 * el schema: por eso acá no hay ni una línea que ajuste `accounts.balance`.
 * Hacerlo además del trigger duplicaría el ajuste.
 */

const rutasAfectadas = [
  '/dashboard',
  '/dashboard/transactions',
  '/dashboard/accounts',
  '/dashboard/commitments',
  '/dashboard/calendar',
  '/dashboard/consolidated',
]

function revalidarTodo() {
  for (const ruta of rutasAfectadas) revalidatePath(ruta)
}

const edicionSchema = z.object({
  amount: z.number().positive('El importe tiene que ser mayor a cero.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.'),
  category_suggested: z.string().max(60),
  description: z.string().trim().min(1, 'Escribí una descripción.').max(120),
  account_id: z.uuid().nullable().optional(),
  /** Cantidad de cuotas deseada. 1 = pago único. */
  installment_total: z.number().int().min(1).max(60).optional(),
  total_financed_amount: z.number().min(0).nullable().optional(),
  installment_amount: z.number().min(0).nullable().optional(),
})

export type EdicionDeMovimiento = z.input<typeof edicionSchema>

type FilaExistente = {
  id: string
  account_id: string
  currency: string | null
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  installment_total: number | null
  installment_current: number | null
  parent_transaction_id: string | null
}

/** Cuántas filas conforman el plan del que participa esta fila. */
export type FormaDelPlan = {
  esPlan: boolean
  esMadre: boolean
  esHija: boolean
  cuotas: number
}

function formaDe(fila: FilaExistente): FormaDelPlan {
  const cuotas = fila.installment_total ?? 1
  const esPlan = cuotas > 1
  const esHija = esPlan && fila.parent_transaction_id !== null
  return { esPlan, esMadre: esPlan && !esHija, esHija, cuotas }
}

/**
 * Modifica un movimiento.
 *
 * TRES CAMINOS, según qué es la fila:
 *
 *   · Cuota HIJA de un plan → se edita solo esa cuota, en el lugar. Cambiarle
 *     la cantidad de cuotas al plan desde una hija sería destruir a sus
 *     hermanas sin que el usuario lo haya pedido, así que no se ofrece.
 *   · Movimiento simple que sigue simple → UPDATE directo.
 *   · Cualquier cosa que toque la ESTRUCTURA de un plan (crear uno, cambiarle
 *     la cantidad de cuotas, o editar la madre de uno existente) → se rehace.
 *
 * El caso "rehacer" reusa `guardarTransaccion` en vez de duplicar el reparto de
 * cuotas, el congelado del equivalente en USD y los reintentos por migración
 * faltante. Y crea ANTES de borrar: si la creación falla, el usuario queda con
 * el movimiento original intacto. Al revés, un fallo lo dejaría sin nada.
 */
export async function updateTransaction(
  id: string,
  entrada: EdicionDeMovimiento
): Promise<ResultadoGuardado> {
  const datos = edicionSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { data: fila, error: errorLectura } = await supabase
    .from('transactions')
    .select('id, account_id, currency, type, installment_total, installment_current, parent_transaction_id')
    .eq('id', id)
    .single()

  if (errorLectura || !fila) return { ok: false, error: 'No se encontró el movimiento.' }

  const existente = fila as FilaExistente
  const forma = formaDe(existente)
  // La moneda no se edita: es la que define en qué libro vive el movimiento, y
  // el modo global del header ya decide cuál se está mirando.
  const moneda = existente.currency?.trim() === 'USD' ? 'USD' : 'ARS'
  const cuotasPedidas = datos.data.installment_total ?? 1

  const cambiaLaEstructura = !forma.esHija && (forma.esMadre || cuotasPedidas > 1)

  if (cambiaLaEstructura) {
    return await rehacerPlan(id, existente, datos.data, moneda)
  }

  // --- Edición en el lugar --------------------------------------------------
  let categoriaId: string | null = null
  if (existente.type !== 'TRANSFER') {
    const resultado = await obtenerOCrearCategoria(
      supabase,
      user.id,
      datos.data.category_suggested,
      existente.type === 'INCOME' ? 'INCOME' : 'EXPENSE'
    )
    if (resultado.error) return { ok: false, error: resultado.error }
    categoriaId = resultado.categoriaId
  }

  // La cuenta destino tiene que ser de la misma moneda: el trigger de
  // migrations/002 lo verifica igual, pero el mensaje de acá se entiende.
  let cuentaId = existente.account_id
  if (datos.data.account_id && datos.data.account_id !== existente.account_id) {
    const { data: elegida } = await supabase
      .from('accounts')
      .select('id, currency')
      .eq('id', datos.data.account_id)
      .single()

    if (!elegida) return { ok: false, error: 'No se encontró la cuenta elegida.' }
    if ((elegida.currency as string).trim() !== moneda) {
      return { ok: false, error: `Esa cuenta no es en ${moneda}.` }
    }
    cuentaId = elegida.id
  }

  const cotizacion = await obtenerCotizacionDelDia(supabase)

  const { error } = await supabase
    .from('transactions')
    .update({
      amount: datos.data.amount,
      amount_usd: calcularMontoUsd(datos.data.amount, moneda, cotizacion),
      date: datos.data.date,
      description: datos.data.description,
      category_id: categoriaId,
      account_id: cuentaId,
    })
    .eq('id', id)

  if (error) {
    console.error('[updateTransaction]', error)
    // 23514 = la guarda de moneda del trigger de migrations/002.
    if (error.code === '23514' && error.message?.includes('moneda')) {
      return { ok: false, error: error.message }
    }
    return { ok: false, error: `No se pudo guardar el cambio: ${error.message}` }
  }

  revalidarTodo()
  return { ok: true }
}

/**
 * Rehace un plan: crea el nuevo y recién entonces borra el viejo.
 *
 * Borrar la madre arrastra a las hijas por el `on delete cascade` de
 * migrations/003, y el trigger de saldo revierte cada fila una por una.
 */
async function rehacerPlan(
  id: string,
  existente: FilaExistente,
  datos: z.output<typeof edicionSchema>,
  moneda: Moneda
): Promise<ResultadoGuardado> {
  const creado = await guardarTransaccion({
    amount: datos.amount,
    type: existente.type,
    currency: moneda,
    category_suggested: datos.category_suggested,
    description: datos.description,
    date: datos.date,
    account_id: datos.account_id ?? existente.account_id,
    installment_total: datos.installment_total ?? 1,
    total_financed_amount: datos.total_financed_amount ?? null,
    installment_amount: datos.installment_amount ?? null,
  })

  if (!creado.ok) {
    return {
      ok: false,
      error: `${creado.error} El movimiento original quedó sin cambios.`,
    }
  }

  const supabase = await createClient()
  // La madre es la que arrastra al resto; si esto era una fila suelta, es ella
  // misma.
  const raiz = existente.parent_transaction_id ?? id
  const { error } = await supabase.from('transactions').delete().eq('id', raiz)

  if (error) {
    console.error('[rehacerPlan:borrado]', error)
    return {
      ok: false,
      error:
        'Se guardó el movimiento nuevo pero no se pudo borrar el anterior: ' +
        `quedaron los dos. Borrá el viejo a mano. (${error.message})`,
    }
  }

  revalidarTodo()
  return { ok: true }
}

/**
 * Borra un movimiento.
 *
 * Si es la madre de un plan de cuotas, el `on delete cascade` se lleva todas
 * las cuotas: el trigger de saldo revierte cada una. Si es una cuota suelta,
 * se va solo esa. Quien llama tiene que avisarle al usuario cuál de los dos
 * casos es ANTES de confirmar; para eso está `contarFilasDelPlan`.
 */
export async function deleteTransaction(id: string): Promise<ResultadoGuardado> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  // El RLS ya limita el borrado a las filas propias; el .eq es defensa extra.
  const { error } = await supabase.from('transactions').delete().eq('id', id)

  if (error) {
    console.error('[deleteTransaction]', error)
    return { ok: false, error: `No se pudo borrar el movimiento: ${error.message}` }
  }

  revalidarTodo()
  return { ok: true }
}
