/**
 * Tests del migrador.
 *
 * El que mas importa es el de saldos: comprueba que derivar el saldo desde los
 * movimientos reproduce lo que venia calculando el trigger de Postgres. Si eso
 * no cierra, el modelo entero de saldos derivados esta mal.
 */

import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { crearLibro } from './libro'
import { crearAlmacenEnMemoria } from './memoria'
import { migrarDesdeSupabase } from './migracion'

/** Supabase de mentira: un diccionario de tabla -> filas. */
function supabaseFalso(tablas: Record<string, Record<string, unknown>[]>) {
  return {
    from(tabla: string) {
      return {
        select() {
          const data = tablas[tabla]
          // Tabla ausente = migracion no corrida en ese proyecto.
          if (!data) return Promise.resolve({ data: null, error: { code: 'PGRST205' } })
          return Promise.resolve({ data, error: null })
        },
      }
    },
  } as unknown as SupabaseClient
}

const CUENTA = {
  id: 'c1',
  user_id: 'u1',
  name: 'Banco',
  type: 'BANK',
  // char(3) con padding, como sale de algunas filas viejas.
  currency: 'ARS',
  balance: '800.00',
  is_liquid: true,
  created_at: '2025-01-01T00:00:00Z',
}

/** numeric llega como STRING desde PostgREST. Es el punto del test. */
const MOVIMIENTOS = [
  { id: 't1', user_id: 'u1', account_id: 'c1', amount: '1000.00', type: 'INCOME', date: '2025-03-01', currency: 'ARS' },
  { id: 't2', user_id: 'u1', account_id: 'c1', amount: '150.50', type: 'EXPENSE', date: '2025-07-01', currency: 'ARS' },
  { id: 't3', user_id: 'u1', account_id: 'c1', amount: '49.50', type: 'EXPENSE', date: '2026-02-01', currency: 'ARS' },
]

describe('migrar desde Supabase', () => {
  it('el saldo derivado reproduce el que mantenia el trigger', async () => {
    // 1000 - 150.50 - 49.50 = 800.00, que es `accounts.balance`.
    const libro = crearLibro(crearAlmacenEnMemoria())
    const resumen = await migrarDesdeSupabase(
      supabaseFalso({ accounts: [CUENTA], transactions: MOVIMIENTOS }),
      libro
    )

    expect(resumen.discrepancias).toEqual([])
    expect(resumen.movimientos).toBe(3)
    expect(resumen.anios).toEqual([2025, 2026])
  })

  it('avisa cuando el saldo NO cierra, en vez de dar por buena la migracion', async () => {
    const libro = crearLibro(crearAlmacenEnMemoria())
    const resumen = await migrarDesdeSupabase(
      supabaseFalso({
        accounts: [{ ...CUENTA, balance: '999.00' }],
        transactions: MOVIMIENTOS,
      }),
      libro
    )

    expect(resumen.discrepancias).toHaveLength(1)
    expect(resumen.discrepancias[0]).toMatchObject({ esperado: 999, obtenido: 800 })
  })

  it('los importes quedan como numeros, no como strings', async () => {
    const libro = crearLibro(crearAlmacenEnMemoria())
    await migrarDesdeSupabase(
      supabaseFalso({ accounts: [CUENTA], transactions: MOVIMIENTOS }),
      libro
    )

    const guardados = await libro.movimientos('1970-01-01', '2999-12-31')
    for (const m of guardados) expect(typeof m.amount).toBe('number')
    // Si `amount` fuera string, esto daria "01000.00150.50" en vez de 1200.
    const suma = guardados.reduce((s, m) => s + m.amount, 0)
    expect(suma).toBeCloseTo(1200, 2)
  })

  it('las tarjetas y los presupuestos quedan embebidos en su padre', async () => {
    const libro = crearLibro(crearAlmacenEnMemoria())
    await migrarDesdeSupabase(
      supabaseFalso({
        accounts: [{ ...CUENTA, id: 'tarjeta', type: 'CREDIT_CARD', balance: '0' }],
        credit_card_details: [
          { account_id: 'tarjeta', closing_day: '20', due_day: '10', credit_limit: '500000' },
        ],
        categories: [{ id: 'cat1', user_id: 'u1', name: 'Comida', type: 'EXPENSE' }],
        category_budgets: [
          { id: 'p1', category_id: 'cat1', amount: '30000', currency: 'ARS' },
        ],
      }),
      libro
    )

    const cuentas = await libro.leer('cuentas')
    expect(cuentas[0].detalle).toMatchObject({ closing_day: 20, credit_limit: 500000 })

    const categorias = await libro.leer('categorias')
    expect(categorias[0].presupuestos).toHaveLength(1)
    expect(categorias[0].presupuestos[0].amount).toBe(30000)
  })

  it('una tabla que no existe no corta la migracion', async () => {
    // Un proyecto sin la 006 no tiene `investments`. El resto migra igual.
    const libro = crearLibro(crearAlmacenEnMemoria())
    const resumen = await migrarDesdeSupabase(
      supabaseFalso({ accounts: [CUENTA], transactions: MOVIMIENTOS }),
      libro
    )

    expect(resumen.inversiones).toBe(0)
    expect(resumen.cuentas).toBe(1)
  })

  it('correrla dos veces deja lo mismo, no el doble', async () => {
    const libro = crearLibro(crearAlmacenEnMemoria())
    const datos = supabaseFalso({ accounts: [CUENTA], transactions: MOVIMIENTOS })

    await migrarDesdeSupabase(datos, libro)
    const segunda = await migrarDesdeSupabase(datos, libro)

    expect(segunda.discrepancias).toEqual([])
    expect(await libro.leer('cuentas')).toHaveLength(1)
    expect(await libro.movimientos('1970-01-01', '2999-12-31')).toHaveLength(3)
  })
})
