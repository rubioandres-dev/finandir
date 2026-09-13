/**
 * MIGRACIÓN — del esquema relacional al almacén de documentos
 * =============================================================================
 *
 * Lee las tablas de siempre y escribe los bloques. Corre UNA vez por usuario,
 * cuando pasa al modo Bóveda o a Drive, y después esas tablas dejan de leerse.
 *
 * ES UN REEMPLAZO, NO UNA FUSIÓN
 *
 * Cada colección se escribe entera, descartando lo que hubiera. Es idempotente
 * por construcción —correrla dos veces deja lo mismo— y es lo correcto para una
 * migración: el origen es la verdad y el destino todavía no tiene nada que
 * valga la pena conservar. La contracara es que NO se puede correr mientras el
 * usuario ya esté cargando datos en el modo nuevo, porque los pisaría.
 *
 * LA VERIFICACIÓN NO ES DECORATIVA
 *
 * Al final compara los SALDOS DERIVADOS contra la columna `accounts.balance`
 * que mantenía el trigger. Es la prueba de fuego del modelo entero: si derivar
 * el saldo desde los movimientos no reproduce lo que Postgres venía calculando,
 * hay un error de modelado y hay que verlo ACÁ, con los datos viejos todavía
 * intactos, y no tres semanas después.
 *
 * `numeric` VUELVE COMO STRING
 *
 * PostgREST serializa `numeric` a string para no perder precisión en el JSON.
 * Si se escribe directo al documento, `amount` termina siendo `"1500.00"` y
 * todas las sumas se vuelven concatenaciones silenciosas. Por eso cada campo
 * numérico pasa por `num()`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PresupuestoDeCategoria } from '../category-budgets-service'
import type { Objetivo } from '../goals-service'
import type { Deuda, Inversion, Transaccion } from '../types'
import { normalizarModulos } from '../modules'
import type { CategoriaGuardada, CuentaGuardada, PerfilGuardado } from './documentos'
import type { Libro } from './libro'
import { recalcularAperturas } from './operaciones'

export type Discrepancia = {
  que: string
  esperado: number
  obtenido: number
}

export type ResumenDeMigracion = {
  cuentas: number
  categorias: number
  movimientos: number
  deudas: number
  inversiones: number
  objetivos: number
  anios: number[]
  /**
   * Vacío = la migración cierra. Con algo adentro, NO hay que dar por buena la
   * migración ni borrar el origen.
   */
  discrepancias: Discrepancia[]
}

type Fila = Record<string, unknown>

/** `numeric` de PostgREST llega como string. Ver el encabezado. */
function num(valor: unknown): number {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

function numONulo(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

/** Una tabla que falta no corta la migración: el usuario no corrió esa migración. */
async function leerTabla(
  supabase: SupabaseClient,
  tabla: string,
  columnas = '*'
): Promise<Fila[]> {
  const { data, error } = await supabase.from(tabla).select(columnas)
  if (error) return []
  // Doble cast: sin tipos generados, supabase-js infiere un `GenericStringError`
  // para una tabla que no conoce y no se deja convertir de una.
  return (data ?? []) as unknown as Fila[]
}

export async function migrarDesdeSupabase(
  supabase: SupabaseClient,
  libro: Libro
): Promise<ResumenDeMigracion> {
  const [
    cuentasCrudas,
    tarjetas,
    categoriasCrudas,
    presupuestos,
    movimientosCrudos,
    deudasCrudas,
    inversionesCrudas,
    objetivosCrudos,
    perfiles,
  ] = await Promise.all([
    leerTabla(supabase, 'accounts'),
    leerTabla(supabase, 'credit_card_details'),
    leerTabla(supabase, 'categories'),
    leerTabla(supabase, 'category_budgets'),
    leerTabla(supabase, 'transactions'),
    leerTabla(supabase, 'debts'),
    leerTabla(supabase, 'investments'),
    leerTabla(supabase, 'financial_goals'),
    leerTabla(supabase, 'user_profiles'),
  ])

  // --- Cuentas, con el detalle de tarjeta adentro ----------------------------
  const detallePorCuenta = new Map(tarjetas.map((t) => [t.account_id as string, t]))

  const cuentas: CuentaGuardada[] = cuentasCrudas.map((c) => {
    const detalle = detallePorCuenta.get(c.id as string)
    return {
      id: c.id as string,
      user_id: c.user_id as string,
      name: c.name as string,
      type: (c.type as CuentaGuardada['type']) ?? 'BANK',
      // `char(3)` viene con padding en algunas filas viejas; el resto de la app
      // ya hace este trim y acá no puede ser la excepción.
      currency: String(c.currency ?? 'ARS').trim(),
      is_liquid: c.is_liquid !== false,
      created_at: (c.created_at as string) ?? new Date().toISOString(),
      detalle: detalle
        ? {
            account_id: detalle.account_id as string,
            closing_day: num(detalle.closing_day),
            due_day: num(detalle.due_day),
            credit_limit: numONulo(detalle.credit_limit),
            bank_name: (detalle.bank_name as string | null) ?? null,
            last_four_digits: (detalle.last_four_digits as string | null) ?? null,
          }
        : null,
    }
  })

  // --- Categorías, con sus presupuestos adentro ------------------------------
  const presupuestosPorCategoria = new Map<string, PresupuestoDeCategoria[]>()
  for (const p of presupuestos) {
    const id = p.category_id as string
    presupuestosPorCategoria.set(id, [
      ...(presupuestosPorCategoria.get(id) ?? []),
      {
        id: p.id as string,
        category_id: id,
        amount: num(p.amount),
        currency: String(p.currency ?? 'ARS').trim(),
      },
    ])
  }

  const categorias: CategoriaGuardada[] = categoriasCrudas.map((c) => ({
    id: c.id as string,
    user_id: c.user_id as string,
    name: String(c.name),
    type: c.type as CategoriaGuardada['type'],
    icon: (c.icon as string) ?? 'circle',
    color: (c.color as string) ?? '#64748B',
    presupuestos: presupuestosPorCategoria.get(c.id as string) ?? [],
  }))

  // --- Movimientos, repartidos por año --------------------------------------
  const movimientos: Transaccion[] = movimientosCrudos.map((t) => ({
    id: t.id as string,
    user_id: t.user_id as string,
    account_id: t.account_id as string,
    category_id: (t.category_id as string | null) ?? null,
    amount: num(t.amount),
    currency: String(t.currency ?? 'ARS').trim(),
    amount_usd: numONulo(t.amount_usd),
    type: t.type as Transaccion['type'],
    description: (t.description as string | null) ?? null,
    date: t.date as string,
    created_at: (t.created_at as string) ?? new Date().toISOString(),
    installment_current: numONulo(t.installment_current),
    installment_total: numONulo(t.installment_total),
    parent_transaction_id: (t.parent_transaction_id as string | null) ?? null,
    has_interest: t.has_interest === true,
    cash_price: numONulo(t.cash_price),
    total_financed_amount: numONulo(t.total_financed_amount),
    installment_amount: numONulo(t.installment_amount),
  }))

  const porAnio = new Map<number, Transaccion[]>()
  for (const m of movimientos) {
    const anio = Number(String(m.date).slice(0, 4))
    if (!Number.isInteger(anio)) continue
    porAnio.set(anio, [...(porAnio.get(anio) ?? []), m])
  }

  // --- Escritura -------------------------------------------------------------
  const perfil = perfiles[0]
  if (perfil) {
    await libro.mutar('perfil', () => aPerfil(perfil))
  }

  await libro.mutar('cuentas', () => cuentas)
  await libro.mutar('categorias', () => categorias)
  await libro.mutar('deudas', () => deudasCrudas.map(aDeuda))
  await libro.mutar('inversiones', () => inversionesCrudas.map(aInversion))
  await libro.mutar('objetivos', () => objetivosCrudos.map(aObjetivo))

  // Ascendente: los shards nacen en orden y cada uno hereda el cierre del
  // anterior. Fuera de orden, las aperturas saldrían mal y el recálculo de
  // abajo tendría que arreglar algo que no hacía falta romper.
  const anios = [...porAnio.keys()].sort((a, b) => a - b)
  for (const anio of anios) {
    const delAnio = porAnio.get(anio) ?? []
    await libro.mutarMovimientos(anio, (shard) => ({ ...shard, movimientos: delAnio }))
  }

  // Los shards se escribieron con `movimientos` ya puestos, así que la herencia
  // automática vio datos a medio cargar. Esto los deja bien de una.
  await recalcularAperturas(libro)

  // --- Verificación ----------------------------------------------------------
  const discrepancias = await verificar(libro, {
    cuentas,
    categorias,
    movimientos,
    saldosOriginales: new Map(
      cuentasCrudas.map((c) => [c.id as string, num(c.balance)])
    ),
  })

  return {
    cuentas: cuentas.length,
    categorias: categorias.length,
    movimientos: movimientos.length,
    deudas: deudasCrudas.length,
    inversiones: inversionesCrudas.length,
    objetivos: objetivosCrudos.length,
    anios,
    discrepancias,
  }
}

// --- Verificación -------------------------------------------------------------

/** Un centavo de tolerancia: `numeric(16,2)` contra flotantes de JavaScript. */
const TOLERANCIA = 0.011

async function verificar(
  libro: Libro,
  origen: {
    cuentas: CuentaGuardada[]
    categorias: CategoriaGuardada[]
    movimientos: Transaccion[]
    saldosOriginales: Map<string, number>
  }
): Promise<Discrepancia[]> {
  const fallas: Discrepancia[] = []

  const cuentas = await libro.leer('cuentas')
  if (cuentas.length !== origen.cuentas.length) {
    fallas.push({
      que: 'cantidad de cuentas',
      esperado: origen.cuentas.length,
      obtenido: cuentas.length,
    })
  }

  const categorias = await libro.leer('categorias')
  if (categorias.length !== origen.categorias.length) {
    fallas.push({
      que: 'cantidad de categorías',
      esperado: origen.categorias.length,
      obtenido: categorias.length,
    })
  }

  // Rango deliberadamente absurdo: tiene que traer TODO lo que se escribió.
  const guardados = await libro.movimientos('1970-01-01', '2999-12-31')
  if (guardados.length !== origen.movimientos.length) {
    fallas.push({
      que: 'cantidad de movimientos',
      esperado: origen.movimientos.length,
      obtenido: guardados.length,
    })
  }

  // LA PRUEBA DE FUEGO. El saldo derivado tiene que dar lo mismo que venía
  // calculando el trigger `apply_transaction_to_balance`. Si no da, el modelo
  // de saldos derivados está mal y este es el único momento barato de saberlo.
  const hoy = new Date().toISOString().slice(0, 10)
  const derivados = await libro.saldos(hoy)

  for (const [id, original] of origen.saldosOriginales) {
    const derivado = derivados[id] ?? 0
    if (Math.abs(derivado - original) > TOLERANCIA) {
      fallas.push({ que: `saldo de la cuenta ${id}`, esperado: original, obtenido: derivado })
    }
  }

  return fallas
}

// --- Mapeos sueltos -----------------------------------------------------------

function aPerfil(p: Fila): PerfilGuardado {
  return {
    // Sin esto, migrar le prende al usuario todos los modulos que habia
    // apagado. Es el tipo de perdida que no tira ningun error.
    active_modules: normalizarModulos(p.active_modules),
    user_id: p.user_id as string,
    display_name: (p.display_name as string | null) ?? null,
    selected_currencies: Array.isArray(p.selected_currencies)
      ? (p.selected_currencies as string[])
      : ['ARS'],
    locale: (p.locale as string) ?? 'es-AR',
    language: (p.language as string) ?? 'es-AR',
    aurem_xp: num(p.aurem_xp),
    aurem_tier: (p.aurem_tier as string) ?? 'BRONZE',
    onboarding_completed: p.onboarding_completed === true,
    updated_at: (p.updated_at as string | null) ?? null,
  }
}

function aDeuda(d: Fila): Deuda {
  return {
    id: d.id as string,
    user_id: d.user_id as string,
    counterparty_name: d.counterparty_name as string,
    total_amount: num(d.total_amount),
    remaining_amount: num(d.remaining_amount),
    currency: String(d.currency ?? 'ARS').trim(),
    type: d.type as Deuda['type'],
    due_date: (d.due_date as string | null) ?? null,
    is_settled: d.is_settled === true,
    description: (d.description as string | null) ?? null,
    created_at: (d.created_at as string) ?? new Date().toISOString(),
  }
}

function aInversion(i: Fila): Inversion {
  return {
    id: i.id as string,
    user_id: i.user_id as string,
    name: i.name as string,
    asset_type: i.asset_type as Inversion['asset_type'],
    currency: String(i.currency ?? 'ARS').trim(),
    amount_invested: num(i.amount_invested),
    current_value: num(i.current_value),
    expected_tna: num(i.expected_tna),
    liquidity_term: (i.liquidity_term as Inversion['liquidity_term']) ?? 'T0',
    broker_entity: (i.broker_entity as string | null) ?? null,
    created_at: (i.created_at as string) ?? new Date().toISOString(),
  }
}

function aObjetivo(o: Fila): Objetivo {
  return {
    id: o.id as string,
    type: o.type as Objetivo['type'],
    target_value: num(o.target_value),
    current_value: num(o.current_value),
    period: (o.period as Objetivo['period']) ?? 'MONTHLY',
    currency: String(o.currency ?? 'ARS').trim(),
    category_id: (o.category_id as string | null) ?? null,
    achieved_at: (o.achieved_at as string | null) ?? null,
    is_active: o.is_active !== false,
  }
}
