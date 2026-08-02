'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { obtenerOCrearCategoria, obtenerOCrearCuenta } from '@/lib/finanzas'
import { resolverPlan, sumarMeses } from '@/lib/cuotas'
import { calcularMontoUsd, obtenerCotizacionDelDia } from '@/lib/rates'

export type ResultadoGuardado = { ok: true } | { ok: false; error: string }

const movimientoSchema = z.object({
  amount: z.number().positive('El importe tiene que ser mayor a cero.'),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  category_suggested: z.string().max(60),
  description: z.string().trim().min(1, 'Escribí una descripción.').max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.'),
  /** Cuenta o tarjeta destino. Si falta, se usa la cuenta líquida de la moneda. */
  account_id: z.uuid().nullable().optional(),
  /** 1 = pago único. `amount` es el TOTAL, que se reparte entre las cuotas. */
  installment_total: z.number().int().min(1).max(60).optional(),
  /** Total a pagar financiado; si viene, es la base del reparto. */
  total_financed_amount: z.number().min(0).nullable().optional(),
  /** Valor de cada cuota tal como lo publica el comercio. */
  installment_amount: z.number().min(0).nullable().optional(),
})


export type MovimientoAGuardar = z.infer<typeof movimientoSchema>

// 42703 = la columna no existe; PGRST204 = no está en el schema cache de
// PostgREST. Ambos significan lo mismo acá: falta correr migrations/004.
function faltanColumnasDelPlan(codigo?: string) {
  return codigo === '42703' || codigo === 'PGRST204'
}

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

  // Si el movimiento va a una tarjeta, la cuenta destino es la tarjeta: el
  // saldo del banco no se toca y la deuda de la tarjeta crece.
  let cuentaId: string
  if (datos.data.account_id) {
    const { data: elegida, error: errorElegida } = await supabase
      .from('accounts')
      .select('id, currency')
      .eq('id', datos.data.account_id)
      .single()

    if (errorElegida || !elegida) return { ok: false, error: 'No se encontró la cuenta elegida.' }
    if (elegida.currency.trim() !== datos.data.currency) {
      return { ok: false, error: 'La moneda del movimiento no coincide con la de la cuenta.' }
    }
    cuentaId = elegida.id
  } else {
    const { cuenta, error: errorCuenta } = await obtenerOCrearCuenta(
      supabase,
      user.id,
      datos.data.currency
    )
    if (errorCuenta || !cuenta) {
      return { ok: false, error: errorCuenta ?? 'No se pudo determinar la cuenta.' }
    }
    cuentaId = cuenta.id
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

  // `amount` es el precio de contado; si hay total financiado o monto de
  // cuota, la base del reparto pasa a ser lo que realmente se va a pagar.
  const plan = resolverPlan({
    cuotas: datos.data.installment_total ?? 1,
    precioContado: datos.data.amount,
    totalFinanciado: datos.data.total_financed_amount ?? null,
    montoDeCuota: datos.data.installment_amount ?? null,
  })

  const cuotas = plan.cuotas
  const montos = plan.montos

  const comun = {
    user_id: user.id,
    account_id: cuentaId,
    category_id: categoriaId,
    currency: datos.data.currency,
    type: datos.data.type,
    description: datos.data.description,
  }

  // Metadatos del plan repetidos en cada cuota: así el desglose del recargo
  // se puede mostrar desde cualquiera sin ir a buscar la madre.
  const metadatosPlan = {
    has_interest: plan.tieneInteres,
    cash_price: cuotas > 1 ? plan.precioContado : null,
    total_financed_amount: cuotas > 1 ? plan.totalAPagar : null,
    installment_amount: cuotas > 1 ? montos[0] : null,
  }

  // Primera cuota: es la "madre" a la que apuntan las demás.
  const primeraCuota = {
    amount: montos[0],
    amount_usd: calcularMontoUsd(montos[0], datos.data.currency, cotizacion),
    date: datos.data.date,
    installment_current: cuotas > 1 ? 1 : null,
    installment_total: cuotas > 1 ? cuotas : null,
  }

  let { data: primera, error: errorInsert } = await supabase
    .from('transactions')
    .insert({ ...comun, ...metadatosPlan, ...primeraCuota })
    .select('id')
    .single()

  // Sin migrations/004 las columnas del plan no existen y el insert falla, aun
  // para un gasto simple. Reintentamos sin esos metadatos: el reparto en cuotas
  // ya está resuelto en `montos`, así que lo único que se pierde es el desglose
  // del recargo, que vuelve solo cuando se corra la migración.
  let guardaMetadatos = true
  if (errorInsert && faltanColumnasDelPlan(errorInsert.code)) {
    guardaMetadatos = false
    console.warn(
      '[guardarTransaccion] Faltan las columnas de intereses; se guarda sin el',
      'desglose del plan. Ejecutá migrations/004_installments_and_interest.sql.'
    )
    ;({ data: primera, error: errorInsert } = await supabase
      .from('transactions')
      .insert({ ...comun, ...primeraCuota })
      .select('id')
      .single())
  }

  if (errorInsert || !primera) {
    console.error('[guardarTransaccion]', errorInsert)
    // 23514 = la guarda de moneda del trigger de migrations/002.
    if (errorInsert?.code === '23514' && errorInsert.message?.includes('moneda')) {
      return { ok: false, error: errorInsert.message }
    }
    return { ok: false, error: 'No se pudo guardar el movimiento. Intentá de nuevo.' }
  }

  // Cuotas siguientes: una por mes, con su fecha real de imputación.
  if (cuotas > 1) {
    const restantes = montos.slice(1).map((monto, indice) => ({
      ...comun,
      ...(guardaMetadatos ? metadatosPlan : {}),
      amount: monto,
      amount_usd: calcularMontoUsd(monto, datos.data.currency, cotizacion),
      date: sumarMeses(datos.data.date, indice + 1),
      installment_current: indice + 2,
      installment_total: cuotas,
      parent_transaction_id: primera.id,
    }))

    const { error: errorCuotas } = await supabase.from('transactions').insert(restantes)

    if (errorCuotas) {
      // Sin las cuotas restantes quedaría un plan a medias: deshacemos.
      await supabase.from('transactions').delete().eq('id', primera.id)
      console.error('[guardarTransaccion:cuotas]', errorCuotas)
      return { ok: false, error: 'No se pudieron generar las cuotas. Intentá de nuevo.' }
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/transactions')
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
