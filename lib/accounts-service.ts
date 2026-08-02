import type { SupabaseClient } from '@supabase/supabase-js'
import { MONEDAS, type TotalPorMoneda } from './monedas'
import type { Cuenta, DetalleTarjeta, Deuda, Moneda, Tarjeta } from './types'

/**
 * Foto patrimonial, siempre desagregada por moneda: pesos y dólares no se
 * suman entre sí en ninguna de estas magnitudes.
 */
export type Patrimonio = {
  /** Efectivo, bancos y billeteras: lo disponible ya. */
  liquido: TotalPorMoneda
  /** Inversiones: es patrimonio, pero no está disponible. */
  inversiones: TotalPorMoneda
  /** Deuda de tarjetas (en positivo). */
  deudaTarjetas: TotalPorMoneda
  /** Lo que le debés a otras personas (en positivo). */
  deudaPersonal: TotalPorMoneda
  /** Lo que te deben: es un activo. */
  porCobrar: TotalPorMoneda
  /** Líquido + inversiones + por cobrar − tarjetas − deuda personal. */
  patrimonioNeto: TotalPorMoneda
}

function ceros(): Map<Moneda, number> {
  return new Map(MONEDAS.map((m) => [m, 0]))
}

function aTotal(acumulado: Map<Moneda, number>): TotalPorMoneda {
  return MONEDAS.map((moneda) => ({
    moneda,
    valor: Math.round((acumulado.get(moneda) ?? 0) * 100) / 100,
  }))
}

function sumarEn(acumulado: Map<Moneda, number>, moneda: string, valor: number) {
  const clave = (moneda === 'USD' ? 'USD' : 'ARS') as Moneda
  acumulado.set(clave, (acumulado.get(clave) ?? 0) + valor)
}

/**
 * Calcula el patrimonio a partir de cuentas y deudas.
 *
 * Función pura para poder verificarla sin base de datos.
 */
export function calcularPatrimonio(cuentas: Cuenta[], deudas: Deuda[]): Patrimonio {
  const liquido = ceros()
  const inversiones = ceros()
  const deudaTarjetas = ceros()
  const deudaPersonal = ceros()
  const porCobrar = ceros()

  for (const cuenta of cuentas) {
    const saldo = Number(cuenta.balance ?? 0)

    if (cuenta.type === 'CREDIT_CARD') {
      // El saldo de una tarjeta es negativo cuando debés: lo pasamos a
      // positivo porque acá representa un pasivo.
      if (saldo < 0) sumarEn(deudaTarjetas, cuenta.currency, -saldo)
      continue
    }

    if (cuenta.type === 'INVESTMENT') {
      sumarEn(inversiones, cuenta.currency, saldo)
      continue
    }

    if (cuenta.is_liquid) sumarEn(liquido, cuenta.currency, saldo)
  }

  for (const deuda of deudas) {
    if (deuda.is_settled) continue
    const pendiente = Number(deuda.remaining_amount ?? 0)
    if (pendiente <= 0) continue

    if (deuda.type === 'OWED_BY_ME') sumarEn(deudaPersonal, deuda.currency, pendiente)
    else sumarEn(porCobrar, deuda.currency, pendiente)
  }

  const neto = ceros()
  for (const moneda of MONEDAS) {
    neto.set(
      moneda,
      (liquido.get(moneda) ?? 0) +
        (inversiones.get(moneda) ?? 0) +
        (porCobrar.get(moneda) ?? 0) -
        (deudaTarjetas.get(moneda) ?? 0) -
        (deudaPersonal.get(moneda) ?? 0)
    )
  }

  return {
    liquido: aTotal(liquido),
    inversiones: aTotal(inversiones),
    deudaTarjetas: aTotal(deudaTarjetas),
    deudaPersonal: aTotal(deudaPersonal),
    porCobrar: aTotal(porCobrar),
    patrimonioNeto: aTotal(neto),
  }
}

/** Cuentas del usuario con el detalle de tarjeta ya adjunto donde aplica. */
export async function cargarCuentasYDeudas(supabase: SupabaseClient): Promise<{
  cuentas: Cuenta[]
  tarjetas: Tarjeta[]
  deudas: Deuda[]
  patrimonio: Patrimonio
  error: string | null
}> {
  const [resCuentas, resDetalles, resDeudas] = await Promise.all([
    supabase.from('accounts').select('*').order('created_at'),
    supabase.from('credit_card_details').select('*'),
    supabase.from('debts').select('*').order('created_at', { ascending: false }),
  ])

  const error =
    resCuentas.error?.message ?? resDetalles.error?.message ?? resDeudas.error?.message ?? null

  const cuentas = (resCuentas.data ?? []) as Cuenta[]
  const detalles = (resDetalles.data ?? []) as DetalleTarjeta[]
  const deudas = (resDeudas.data ?? []) as Deuda[]

  const detallePorCuenta = new Map(detalles.map((d) => [d.account_id, d]))

  const tarjetas: Tarjeta[] = cuentas
    .filter((c) => c.type === 'CREDIT_CARD')
    .flatMap((c) => {
      const detalle = detallePorCuenta.get(c.id)
      // Una tarjeta sin fechas de cierre no sirve para recomendar nada.
      return detalle ? [{ ...c, detalle }] : []
    })

  return { cuentas, tarjetas, deudas, patrimonio: calcularPatrimonio(cuentas, deudas), error }
}
