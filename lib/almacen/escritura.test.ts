/**
 * Tests de los metodos angostos de escritura.
 *
 * Dos de estos cubren invariantes que en relacional las mantiene Postgres y del
 * lado de documentos hay que sostener a mano: la cascada de
 * `parent_transaction_id` y la mudanza de shard cuando cambia el anio. Los dos
 * fallan en silencio si se rompen.
 */

import { describe, expect, it } from 'vitest'
import { crearLibro } from './libro'
import { crearAlmacenEnMemoria } from './memoria'
import type { Transaccion } from '../types'

function mov(p: Partial<Transaccion>): Transaccion {
  return {
    id: crypto.randomUUID(), user_id: 'u1', account_id: 'c1', category_id: null,
    amount: 100, currency: 'ARS', amount_usd: null, type: 'EXPENSE', description: null,
    date: '2026-06-01', created_at: '2026-06-01T00:00:00Z', installment_current: null,
    installment_total: null, parent_transaction_id: null, has_interest: false,
    cash_price: null, total_financed_amount: null, installment_amount: null, ...p,
  }
}

const libroVacio = () => crearLibro(crearAlmacenEnMemoria())

describe('agregar movimientos', () => {
  it('reparte cada uno en el shard de su anio', async () => {
    const libro = libroVacio()
    await libro.agregarMovimientos([
      mov({ id: 'a', date: '2025-11-01' }),
      mov({ id: 'b', date: '2026-01-01' }),
    ])

    expect(await libro.aniosConMovimientos()).toEqual([2025, 2026])
    expect((await libro.movimientos('2026-01-01', '2026-12-31')).map((m) => m.id)).toEqual(['b'])
  })

  it('agregar dos veces lo mismo no duplica', async () => {
    const libro = libroVacio()
    const plan = [mov({ id: 'q1' }), mov({ id: 'q2', date: '2026-07-01' })]

    await libro.agregarMovimientos(plan)
    await libro.agregarMovimientos(plan)

    const todos = await libro.movimientos('2026-01-01', '2026-12-31')
    expect(todos.map((m) => m.id).sort()).toEqual(['q1', 'q2'])
  })
})

describe('buscar uno por id', () => {
  it('lo encuentra en el shard que sea', async () => {
    const libro = libroVacio()
    await libro.agregarMovimientos([mov({ id: 'viejo', date: '2024-03-01' })])
    expect((await libro.movimiento('viejo'))?.date).toBe('2024-03-01')
  })

  it('devuelve null si no esta', async () => {
    expect(await libroVacio().movimiento('fantasma')).toBeNull()
  })
})

describe('editar un movimiento', () => {
  it('reemplaza el contenido', async () => {
    const libro = libroVacio()
    await libro.agregarMovimientos([mov({ id: 'x', amount: 100 })])
    await libro.editarMovimiento(mov({ id: 'x', amount: 250 }))

    expect((await libro.movimiento('x'))?.amount).toBe(250)
  })

  it('SE MUDA DE SHARD cuando la fecha cambia de anio', async () => {
    // En relacional cambiar el anio es un UPDATE y no mueve nada. Aca el
    // movimiento vive adentro del shard de su anio: sin la mudanza quedaria
    // duplicado en los dos, o perdido en el viejo.
    const libro = libroVacio()
    await libro.agregarMovimientos([mov({ id: 'x', date: '2025-12-28' })])

    await libro.editarMovimiento(mov({ id: 'x', date: '2026-01-03' }))

    expect(await libro.movimientos('2025-01-01', '2025-12-31')).toEqual([])
    expect((await libro.movimientos('2026-01-01', '2026-12-31')).map((m) => m.id)).toEqual(['x'])
  })
})

describe('borrar un movimiento', () => {
  it('borra el que se pide y deja los demas', async () => {
    const libro = libroVacio()
    await libro.agregarMovimientos([mov({ id: 'a' }), mov({ id: 'b' })])

    await libro.borrarMovimiento('a')

    expect((await libro.movimientos('2026-01-01', '2026-12-31')).map((m) => m.id)).toEqual(['b'])
  })

  it('ARRASTRA las cuotas del plan, aunque esten en otros anios', async () => {
    // Replica el `on delete cascade` de `parent_transaction_id` (migracion 003).
    // Sin esto, borrar la madre deja cuotas apuntando a un id que ya no existe.
    const libro = libroVacio()
    await libro.agregarMovimientos([
      mov({ id: 'madre', date: '2026-11-01', installment_current: 1, installment_total: 3 }),
      mov({ id: 'c2', date: '2026-12-01', parent_transaction_id: 'madre' }),
      mov({ id: 'c3', date: '2027-01-01', parent_transaction_id: 'madre' }),
    ])

    await libro.borrarMovimiento('madre')

    expect(await libro.movimientos('2026-01-01', '2027-12-31')).toEqual([])
  })

  it('borrar UNA cuota no se lleva a sus hermanas', async () => {
    const libro = libroVacio()
    await libro.agregarMovimientos([
      mov({ id: 'madre', date: '2026-11-01' }),
      mov({ id: 'c2', date: '2026-12-01', parent_transaction_id: 'madre' }),
      mov({ id: 'c3', date: '2027-01-01', parent_transaction_id: 'madre' }),
    ])

    await libro.borrarMovimiento('c2')

    const quedan = await libro.movimientos('2026-01-01', '2027-12-31')
    expect(quedan.map((m) => m.id).sort()).toEqual(['c3', 'madre'])
  })

  it('borrar algo que no existe no rompe nada', async () => {
    const libro = libroVacio()
    await libro.agregarMovimientos([mov({ id: 'a' })])
    await libro.borrarMovimiento('fantasma')
    expect(await libro.movimientos('2026-01-01', '2026-12-31')).toHaveLength(1)
  })
})

describe('el saldo sigue las escrituras', () => {
  it('agregar y borrar mueven el saldo derivado', async () => {
    const libro = libroVacio()
    await libro.agregarMovimientos([
      mov({ id: 'in', type: 'INCOME', amount: 1000, date: '2026-01-05' }),
      mov({ id: 'out', type: 'EXPENSE', amount: 300, date: '2026-02-05' }),
    ])
    expect(await libro.saldos('2026-12-31')).toEqual({ c1: 700 })

    await libro.borrarMovimiento('out')
    expect(await libro.saldos('2026-12-31')).toEqual({ c1: 1000 })
  })
})
