'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  FALTA_MIGRACION_PRESUPUESTOS,
  faltaLaTabla as faltaLaTablaDePresupuestos,
} from '@/lib/category-budgets-service'
import { codigoDeError } from '@/lib/almacen/tipos'
import { CODIGOS_DE_MONEDA } from '@/lib/monedas'
import { libroDelServidor } from '@/lib/almacen/acceso'
import { createClient } from '@/lib/supabase/server'
import type { Moneda, Transaccion } from '@/lib/types'
import { obtenerOCrearCategoria, obtenerOCrearCuenta } from '@/lib/finanzas'
import { resolverPlan, sumarMeses } from '@/lib/cuotas'
import { calcularMontoUsd, obtenerCotizacionDelDia } from '@/lib/rates'

/**
 * `id` es el de la transacción madre (la primera cuota, si hay plan).
 *
 * Es opcional porque lo devuelven sólo las acciones que crean UN movimiento y
 * pueden decir cuál: `guardarCuenta` o `borrarDeuda` comparten este tipo y no
 * tienen ningún id de transacción que informar. Quien lo necesite —hoy la
 * Calculadora de Salidas, para atar las cuentas por cobrar a su gasto— tiene que
 * tolerar que venga `undefined`.
 */
export type ResultadoGuardado = { ok: true; id?: string } | { ok: false; error: string }

const movimientoSchema = z.object({
  amount: z.number().positive('El importe tiene que ser mayor a cero.'),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  currency: z.enum(CODIGOS_DE_MONEDA).default('ARS'),
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
//
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

  const libro = await libroDelServidor(supabase, user.id)

  // Si el movimiento va a una tarjeta, la cuenta destino es la tarjeta: el
  // saldo del banco no se toca y la deuda de la tarjeta crece.
  let cuentaId: string
  if (datos.data.account_id) {
    const elegida = (await libro.leer('cuentas')).find(
      (c) => c.id === datos.data.account_id
    )

    if (!elegida) return { ok: false, error: 'No se encontró la cuenta elegida.' }
    if (elegida.currency.trim() !== datos.data.currency) {
      return { ok: false, error: 'La moneda del movimiento no coincide con la de la cuenta.' }
    }
    cuentaId = elegida.id
  } else {
    const { cuentaId: resuelta, error: errorCuenta } = await obtenerOCrearCuenta(
      libro,
      user.id,
      datos.data.currency
    )
    if (errorCuenta || !resuelta) {
      return { ok: false, error: errorCuenta ?? 'No se pudo determinar la cuenta.' }
    }
    cuentaId = resuelta
  }

  // El CHECK `transactions_transfer_has_no_category` obliga a que las
  // transferencias vayan sin categoría.
  let categoriaId: string | null = null
  if (datos.data.type !== 'TRANSFER') {
    const resultado = await obtenerOCrearCategoria(
      libro,
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
  const idMadre = crypto.randomUUID()
  const ahora = new Date().toISOString()

  /**
   * El plan entero, de una.
   *
   * Antes esto eran dos inserts —la madre primero para conocer su id, despues
   * las demas apuntandole— con un borrado compensatorio si el segundo fallaba.
   * Generando el id de la madre en el cliente, las N cuotas se arman juntas y
   * se guardan en una sola operacion.
   *
   * Los metadatos del plan van repetidos en cada cuota a proposito: asi el
   * desglose del recargo se puede mostrar desde cualquiera sin ir a buscar la
   * madre.
   */
  const movimientos: Transaccion[] = plan.montos.map((monto, indice) => ({
    id: indice === 0 ? idMadre : crypto.randomUUID(),
    user_id: user.id,
    account_id: cuentaId,
    category_id: categoriaId,
    amount: monto,
    amount_usd: calcularMontoUsd(monto, datos.data.currency, cotizacion),
    currency: datos.data.currency,
    type: datos.data.type,
    description: datos.data.description,
    date: indice === 0 ? datos.data.date : sumarMeses(datos.data.date, indice),
    created_at: ahora,
    installment_current: cuotas > 1 ? indice + 1 : null,
    installment_total: cuotas > 1 ? cuotas : null,
    parent_transaction_id: indice === 0 ? null : idMadre,
    has_interest: plan.tieneInteres,
    cash_price: cuotas > 1 ? plan.precioContado : null,
    total_financed_amount: cuotas > 1 ? plan.totalAPagar : null,
    installment_amount: cuotas > 1 ? plan.montos[0] : null,
  }))

  try {
    await libro.agregarMovimientos(movimientos)
  } catch (error) {
    console.error('[guardarTransaccion]', error)
    const mensaje = error instanceof Error ? error.message : 'Error desconocido.'

    // Un plan a medias es peor que ninguno: si el usuario reintenta, los ids
    // nuevos duplicarian las cuotas que si entraron. `borrarMovimiento` se
    // lleva la madre y sus cuotas de un saque.
    //
    // El dia que `abrirLibro()` este cableado esto sobra: el diario reanuda la
    // operacion con los MISMOS ids y la completa en vez de deshacerla.
    if (cuotas > 1) {
      try {
        await libro.borrarMovimiento(idMadre)
      } catch {
        // Si tampoco se puede limpiar, el mensaje de abajo es lo unico que
        // queda; no tiene sentido tapar el error original con este.
      }
    }

    // La guarda de moneda del trigger de migrations/002 llega como texto.
    if (mensaje.includes('moneda')) return { ok: false, error: mensaje }
    if (faltanColumnasDelPlan(codigoDeError(error))) {
      return {
        ok: false,
        error:
          'Faltan las columnas de intereses. Ejecutá ' +
          'migrations/004_installments_and_interest.sql en el SQL Editor de Supabase.',
      }
    }
    return { ok: false, error: 'No se pudo guardar el movimiento. Intentá de nuevo.' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/transactions')
  return { ok: true, id: idMadre }
}

const presupuestoSchema = z.object({
  categoriaId: z.uuid('Categoría inválida.'),
  moneda: z.enum(CODIGOS_DE_MONEDA),
  // null = quitar el presupuesto de esa moneda.
  monto: z.number().min(0, 'El presupuesto no puede ser negativo.').nullable(),
})

/**
 * Define (o borra, con monto null) el presupuesto mensual de una categoría
 * en una moneda. Cada moneda lleva su propio límite y se compara solo contra
 * los gastos de esa misma moneda.
 *
 * ESCRIBE EN `category_budgets` DESDE LA 013
 *
 * Antes escribía en `budgets`, que era una de las dos fuentes del mismo número
 * —la otra eran los objetivos CATEGORY_BUDGET— y por eso Ajustes y el Home
 * podían mostrar techos distintos para la misma categoría. La tabla vieja sigue
 * existiendo con sus datos, pero ya nadie la lee ni la escribe.
 */
export async function guardarPresupuesto(
  categoriaId: string,
  moneda: Moneda,
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

  const libro = await libroDelServidor(supabase, user.id)

  try {
    // El presupuesto vive EMBEBIDO en su categoria, asi que definirlo es mutar
    // la categoria. La busqueda del que ya existe va adentro de la mutacion:
    // decidir afuera si hay que crear o reemplazar es lo que duplicaria si otro
    // dispositivo escribe en el medio.
    await libro.mutar('categorias', (categorias) =>
      categorias.map((categoria) => {
        if (categoria.id !== datos.data.categoriaId) return categoria

        const otrasMonedas = categoria.presupuestos.filter(
          (pres) => pres.currency !== datos.data.moneda
        )

        if (datos.data.monto === null) {
          return { ...categoria, presupuestos: otrasMonedas }
        }

        const previo = categoria.presupuestos.find(
          (pres) => pres.currency === datos.data.moneda
        )

        return {
          ...categoria,
          presupuestos: [
            ...otrasMonedas,
            {
              // Se reusa el id del que habia: si no, cada cambio de monto
              // dejaria una fila nueva y la vieja colgada.
              id: previo?.id ?? crypto.randomUUID(),
              category_id: datos.data.categoriaId,
              currency: datos.data.moneda,
              amount: datos.data.monto,
            },
          ],
        }
      })
    )
  } catch (error) {
    if (faltaLaTablaDePresupuestos(codigoDeError(error))) {
      return { ok: false, error: FALTA_MIGRACION_PRESUPUESTOS }
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

  try {
    // Se lleva las cuotas si es la madre de un plan: `borrarMovimiento` replica
    // el `on delete cascade` de `parent_transaction_id` en los dos backends.
    await (await libroDelServidor(supabase, user.id)).borrarMovimiento(id)
  } catch (error) {
    console.error('[borrarTransaccion]', error)
    return { ok: false, error: 'No se pudo borrar el movimiento.' }
  }

  revalidatePath('/dashboard')
  return { ok: true }
}
