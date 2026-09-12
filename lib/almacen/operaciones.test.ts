/**
 * Tests de las cascadas, del encadenado de aperturas y de la apertura del
 * libro.
 *
 * Las cascadas se prueban DOS veces cada una: la corrida normal y la corrida
 * repetida. La segunda no es redundante — el diario rehace la operación entera
 * desde el principio cuando algo se cortó, así que una operación que no aguanta
 * correr dos veces corrompe datos justo el día que se corta la red.
 */

import { describe, expect, it } from 'vitest'
import { CLAVE_MANIFIESTO, claveDeShard, type Manifiesto } from './documentos'
import { abrirLibro, crearLibro, IntencionAtascada, type Libro } from './libro'
import { crearAlmacenEnMemoria, type AlmacenEnMemoria } from './memoria'
import {
  borrarCategoria,
  borrarCuenta,
  guardarPlanDeCuotas,
  moverMovimientoDeAnio,
  recalcularAperturas,
  REPLAYS,
} from './operaciones'
import type { Transaccion } from '../types'

function mov(parcial: Partial<Transaccion> = {}): Transaccion {
  return {
    id: parcial.id ?? crypto.randomUUID(),
    user_id: 'u1',
    account_id: 'c1',
    category_id: null,
    amount: 0,
    currency: 'ARS',
    amount_usd: null,
    type: 'EXPENSE',
    description: null,
    date: '2026-06-01',
    created_at: '2026-06-01T00:00:00Z',
    installment_current: null,
    installment_total: null,
    parent_transaction_id: null,
    has_interest: false,
    cash_price: null,
    total_financed_amount: null,
    installment_amount: null,
    ...parcial,
  }
}

/** Libro sobre memoria, con los movimientos ya repartidos por año. */
async function conMovimientos(
  movimientos: Transaccion[]
): Promise<{ libro: Libro; almacen: AlmacenEnMemoria }> {
  const almacen = crearAlmacenEnMemoria()
  const libro = crearLibro(almacen)

  const anios = [...new Set(movimientos.map((m) => Number(m.date.slice(0, 4))))].sort()
  for (const anio of anios) {
    await libro.mutarMovimientos(anio, (shard) => ({
      ...shard,
      movimientos: movimientos.filter((m) => m.date.startsWith(String(anio))),
    }))
  }

  return { libro, almacen }
}

// --- Registro de shards y aperturas -----------------------------------------

describe('shards', () => {
  it('un año nuevo queda registrado en el manifiesto', async () => {
    const { libro } = await conMovimientos([mov({ date: '2026-03-01' })])
    expect(await libro.aniosConMovimientos()).toEqual([2026])
  })

  it('un año nuevo HEREDA el cierre del anterior como apertura', async () => {
    // Esto es lo que hace correcto al sharding. Sin herencia, el 1 de enero
    // todas las cuentas aparecerían en cero.
    const almacen = crearAlmacenEnMemoria()
    const libro = crearLibro(almacen)

    await libro.mutarMovimientos(2025, (s) => ({
      ...s,
      movimientos: [mov({ type: 'INCOME', amount: 1000, date: '2025-05-01' })],
    }))
    await libro.mutarMovimientos(2026, (s) => ({
      ...s,
      movimientos: [mov({ type: 'EXPENSE', amount: 300, date: '2026-02-01' })],
    }))

    expect(await libro.saldos('2026-12-31')).toEqual({ c1: 700 })
  })

  it('el primer ejercicio de todos arranca en cero', async () => {
    const { libro } = await conMovimientos([
      mov({ type: 'INCOME', amount: 50, date: '2024-01-05' }),
    ])
    expect(await libro.saldos('2024-12-31')).toEqual({ c1: 50 })
  })
})

// --- Borrar una cuenta -------------------------------------------------------

describe('borrar una cuenta', () => {
  it('se lleva sus movimientos de todos los años y deja los ajenos', async () => {
    const { libro } = await conMovimientos([
      mov({ id: 'a25', account_id: 'c1', date: '2025-04-01' }),
      mov({ id: 'a26', account_id: 'c1', date: '2026-04-01' }),
      mov({ id: 'otra', account_id: 'c2', date: '2026-04-02' }),
    ])
    await libro.mutar('cuentas', () => [
      { id: 'c1' },
      { id: 'c2' },
    ] as never)

    await borrarCuenta(libro, 'c1')

    expect((await libro.movimientos('2020-01-01', '2030-12-31')).map((m) => m.id)).toEqual(
      ['otra']
    )
    expect((await libro.leer('cuentas')).map((c) => c.id)).toEqual(['c2'])
  })

  it('corrida dos veces deja el mismo resultado', async () => {
    const { libro } = await conMovimientos([mov({ id: 'a', account_id: 'c1' })])
    await libro.mutar('cuentas', () => [{ id: 'c1' }] as never)

    await borrarCuenta(libro, 'c1')
    await borrarCuenta(libro, 'c1')

    expect(await libro.leer('cuentas')).toEqual([])
    expect(await libro.movimientos('2020-01-01', '2030-12-31')).toEqual([])
  })

  it('la apertura de la cuenta borrada no queda arrastrándose', async () => {
    const almacen = crearAlmacenEnMemoria()
    const libro = crearLibro(almacen)
    await libro.mutarMovimientos(2025, (s) => ({
      ...s,
      movimientos: [mov({ type: 'INCOME', amount: 900, date: '2025-01-01' })],
    }))
    await libro.mutarMovimientos(2026, (s) => ({ ...s, movimientos: [] }))
    // El shard 2026 heredó { c1: 900 }.

    await borrarCuenta(libro, 'c1')

    expect(await libro.saldos('2026-06-01')).toEqual({})
  })
})

// --- Borrar una categoría ----------------------------------------------------

describe('borrar una categoría', () => {
  it('desclasifica los movimientos pero NO los borra', async () => {
    const { libro } = await conMovimientos([
      mov({ id: 'a', category_id: 'cat', date: '2025-01-01' }),
      mov({ id: 'b', category_id: 'cat', date: '2026-01-01' }),
      mov({ id: 'c', category_id: 'otra', date: '2026-01-02' }),
    ])
    await libro.mutar('categorias', () => [{ id: 'cat' }, { id: 'otra' }] as never)

    await borrarCategoria(libro, 'cat')

    const todos = await libro.movimientos('2020-01-01', '2030-12-31')
    expect(todos).toHaveLength(3)
    expect(todos.filter((m) => m.category_id === 'cat')).toHaveLength(0)
    expect(todos.find((m) => m.id === 'c')?.category_id).toBe('otra')
    expect((await libro.leer('categorias')).map((c) => c.id)).toEqual(['otra'])
  })
})

// --- Plan de cuotas ----------------------------------------------------------

describe('plan de cuotas', () => {
  const plan = [
    mov({ id: 'q1', date: '2026-11-01', amount: 100 }),
    mov({ id: 'q2', date: '2026-12-01', amount: 100 }),
    mov({ id: 'q3', date: '2027-01-01', amount: 100 }),
  ]

  it('reparte las cuotas en el shard de cada año', async () => {
    const libro = crearLibro(crearAlmacenEnMemoria())
    await guardarPlanDeCuotas(libro, plan)

    expect(await libro.aniosConMovimientos()).toEqual([2026, 2027])
    expect((await libro.movimientos('2027-01-01', '2027-12-31')).map((m) => m.id)).toEqual(
      ['q3']
    )
  })

  it('corrido dos veces no duplica ninguna cuota', async () => {
    const libro = crearLibro(crearAlmacenEnMemoria())
    await guardarPlanDeCuotas(libro, plan)
    await guardarPlanDeCuotas(libro, plan)

    const todos = await libro.movimientos('2020-01-01', '2030-12-31')
    expect(todos.map((m) => m.id).sort()).toEqual(['q1', 'q2', 'q3'])
  })
})

describe('mover un movimiento de año', () => {
  it('sale del viejo y entra en el nuevo, sin duplicarse', async () => {
    const original = mov({ id: 'x', date: '2025-12-28' })
    const { libro } = await conMovimientos([original])

    await moverMovimientoDeAnio(libro, { ...original, date: '2026-01-03' }, 2025)

    expect(await libro.movimientos('2025-01-01', '2025-12-31')).toEqual([])
    expect((await libro.movimientos('2026-01-01', '2026-12-31')).map((m) => m.id)).toEqual(
      ['x']
    )
  })
})

// --- Recálculo de aperturas --------------------------------------------------

describe('recalcular aperturas', () => {
  it('encadena el cierre de cada año con la apertura del siguiente', async () => {
    const { libro, almacen } = await conMovimientos([
      mov({ type: 'INCOME', amount: 1000, date: '2024-06-01' }),
      mov({ type: 'EXPENSE', amount: 400, date: '2025-06-01' }),
      mov({ type: 'EXPENSE', amount: 100, date: '2026-06-01' }),
    ])

    // Se ensucian a mano para probar que el recálculo repara.
    for (const anio of [2024, 2025, 2026]) {
      almacen.sembrar(claveDeShard(anio), {
        ...almacen.espiar<Record<string, unknown>>(claveDeShard(anio)),
        aperturas: { c1: 99999 },
      })
    }
    libro.invalidar()

    await recalcularAperturas(libro)

    expect(await libro.saldos('2024-12-31')).toEqual({ c1: 1000 })
    expect(await libro.saldos('2025-12-31')).toEqual({ c1: 600 })
    expect(await libro.saldos('2026-12-31')).toEqual({ c1: 500 })
  })
})

// --- Apertura del libro ------------------------------------------------------

describe('abrirLibro', () => {
  it('reanuda la intención que quedó pendiente y la limpia', async () => {
    const almacen = crearAlmacenEnMemoria()
    // Un borrado que se cortó: la cuenta sigue, el diario la acusa.
    almacen.sembrar('cuentas', [{ id: 'c1' }])
    almacen.sembrar(CLAVE_MANIFIESTO, {
      esquema: 1,
      creado: '2026-01-01T00:00:00Z',
      shards: [],
      pendiente: {
        id: 'i1',
        operacion: 'borrar-cuenta',
        parametros: { cuentaId: 'c1' },
        iniciada: '2026-01-01T00:00:00Z',
        intentos: 1,
      },
    } satisfies Manifiesto)

    const libro = await abrirLibro(almacen, { replays: REPLAYS })

    expect(await libro.leer('cuentas')).toEqual([])
    expect(almacen.espiar<Manifiesto>(CLAVE_MANIFIESTO)?.pendiente).toBeNull()
  })

  it('se rinde si la intención ya agotó los intentos', async () => {
    const almacen = crearAlmacenEnMemoria()
    almacen.sembrar(CLAVE_MANIFIESTO, {
      esquema: 1,
      creado: '2026-01-01T00:00:00Z',
      shards: [],
      pendiente: {
        id: 'i1',
        operacion: 'borrar-cuenta',
        parametros: { cuentaId: 'c1' },
        iniciada: '2026-01-01T00:00:00Z',
        intentos: 3,
      },
    } satisfies Manifiesto)

    // Mejor fallar ruidoso que dejar el almacén a medias para siempre.
    await expect(abrirLibro(almacen, { replays: REPLAYS })).rejects.toThrow(
      IntencionAtascada
    )
  })

  it('corre las migraciones de esquema en orden y sube la versión', async () => {
    const almacen = crearAlmacenEnMemoria()
    almacen.sembrar(CLAVE_MANIFIESTO, {
      esquema: 0,
      creado: '2026-01-01T00:00:00Z',
      shards: [],
      pendiente: null,
    } as unknown as Manifiesto)

    const corridas: number[] = []
    await abrirLibro(almacen, {
      migraciones: {
        0: async () => {
          corridas.push(0)
        },
      },
    })

    expect(corridas).toEqual([0])
    expect(almacen.espiar<Manifiesto>(CLAVE_MANIFIESTO)?.esquema).toBe(1)
  })

  it('no arranca si falta la migración que hace falta', async () => {
    const almacen = crearAlmacenEnMemoria()
    almacen.sembrar(CLAVE_MANIFIESTO, {
      esquema: 0,
      creado: '2026-01-01T00:00:00Z',
      shards: [],
      pendiente: null,
    } as unknown as Manifiesto)

    await expect(abrirLibro(almacen)).rejects.toThrow(/No hay migración/)
  })
})
