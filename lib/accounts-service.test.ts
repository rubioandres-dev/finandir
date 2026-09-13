/**
 * Estas pruebas no existian antes del port, y no por olvido: `cargarCuentasYDeudas`
 * pedia un `SupabaseClient` y no habia forma de darle uno sin red. Contra un
 * `Libro` en memoria, la misma funcion se prueba en milisegundos.
 */

import { describe, expect, it } from 'vitest'
import { cargarCuentasYDeudas } from './accounts-service'
import { claveDeShard } from './almacen/documentos'
import { crearLibro } from './almacen/libro'
import { crearAlmacenEnMemoria } from './almacen/memoria'
import type { Transaccion } from './types'

function mov(p: Partial<Transaccion>): Transaccion {
  return {
    id: crypto.randomUUID(), user_id: 'u1', account_id: 'c1', category_id: null,
    amount: 0, currency: 'ARS', amount_usd: null, type: 'EXPENSE', description: null,
    date: '2026-06-01', created_at: '2026-06-01T00:00:00Z', installment_current: null,
    installment_total: null, parent_transaction_id: null, has_interest: false,
    cash_price: null, total_financed_amount: null, installment_amount: null, ...p,
  }
}

const CUENTA = {
  id: 'c1', user_id: 'u1', name: 'Banco', type: 'BANK' as const, currency: 'ARS',
  is_liquid: true, created_at: '2025-01-01T00:00:00Z', detalle: null,
}

const TARJETA = {
  id: 'tj', user_id: 'u1', name: 'Visa', type: 'CREDIT_CARD' as const, currency: 'ARS',
  is_liquid: false, created_at: '2025-01-01T00:00:00Z',
  detalle: { account_id: 'tj', closing_day: 20, due_day: 10, credit_limit: 500000,
             bank_name: 'Galicia', last_four_digits: '1234' },
}

async function libroCon(cuentas: unknown[], movimientos: Transaccion[] = []) {
  const almacen = crearAlmacenEnMemoria()
  const libro = crearLibro(almacen)
  await libro.mutar('cuentas', () => cuentas as never)
  if (movimientos.length) {
    almacen.sembrar(claveDeShard(2026), { anio: 2026, aperturas: {}, movimientos })
  }
  return libro
}

describe('cargar cuentas y deudas', () => {
  it('el saldo se DERIVA de los movimientos, no sale de una columna', async () => {
    const libro = await libroCon([CUENTA], [
      mov({ type: 'INCOME', amount: 1000, date: '2026-01-05' }),
      mov({ type: 'EXPENSE', amount: 250, date: '2026-02-05' }),
    ])

    const { cuentas } = await cargarCuentasYDeudas(libro, ['ARS'])
    expect(cuentas[0].balance).toBe(750)
  })

  it('una cuenta sin movimientos vale cero, no undefined', async () => {
    const libro = await libroCon([CUENTA])
    const { cuentas } = await cargarCuentasYDeudas(libro, ['ARS'])
    expect(cuentas[0].balance).toBe(0)
  })

  it('una tarjeta SIN detalle no entra en tarjetas', async () => {
    // Sin fechas de cierre no se puede recomendar con cual pagar, asi que no
    // sirve como tarjeta aunque la cuenta exista.
    const libro = await libroCon([{ ...TARJETA, detalle: null }])
    const { cuentas, tarjetas } = await cargarCuentasYDeudas(libro, ['ARS'])
    expect(cuentas).toHaveLength(1)
    expect(tarjetas).toHaveLength(0)
  })

  it('una tarjeta con detalle lo trae adjunto y con su saldo', async () => {
    const libro = await libroCon([TARJETA], [
      mov({ account_id: 'tj', type: 'EXPENSE', amount: 80000, date: '2026-03-01' }),
    ])

    const { tarjetas } = await cargarCuentasYDeudas(libro, ['ARS'])
    expect(tarjetas).toHaveLength(1)
    expect(tarjetas[0].detalle.closing_day).toBe(20)
    // En tarjetas el negativo ES la deuda acumulada.
    expect(tarjetas[0].balance).toBe(-80000)
  })

  it('si la lectura falla devuelve el error, no se cae', async () => {
    // Media docena de paginas llaman a esto; ninguna deberia romperse entera
    // porque no se pudo leer una cuenta.
    const libro = crearLibro(crearAlmacenEnMemoria())
    const roto = { ...libro, leer: () => Promise.reject(new Error('sin red')) }

    const r = await cargarCuentasYDeudas(roto, ['ARS'])
    expect(r.error).toBe('sin red')
    expect(r.cuentas).toEqual([])
  })
})
