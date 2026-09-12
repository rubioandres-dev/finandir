/**
 * Tests del lazo de conflictos y de lo que reemplaza a Postgres.
 *
 * Lo que se prueba acá NO es "el código hace lo que dice": es que dos
 * dispositivos escribiendo a la vez no pierdan datos, y que los saldos
 * derivados den lo mismo que daba el trigger `apply_transaction_to_balance`.
 * Son las dos cosas que, si fallan, fallan en silencio y con plata.
 */

import { describe, expect, it } from 'vitest'
import {
  CLAVE_MANIFIESTO,
  claveDeShard,
  type CuentaGuardada,
  type Manifiesto,
  type ShardDeMovimientos,
} from './documentos'
import { crearLibro } from './libro'
import { crearAlmacenEnMemoria } from './memoria'
import type { Transaccion } from '../types'

// --- Fixtures ----------------------------------------------------------------

function cuenta(parcial: Partial<CuentaGuardada> = {}): CuentaGuardada {
  return {
    id: parcial.id ?? crypto.randomUUID(),
    user_id: 'u1',
    name: 'Cuenta',
    type: 'BANK',
    currency: 'ARS',
    is_liquid: true,
    created_at: '2026-01-01T00:00:00Z',
    detalle: null,
    ...parcial,
  }
}

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

function shard(parcial: Partial<ShardDeMovimientos> = {}): ShardDeMovimientos {
  return { anio: 2026, aperturas: {}, movimientos: [], ...parcial }
}

// --- Lectura y escritura básica ----------------------------------------------

describe('lectura', () => {
  it('una colección sin bloque devuelve vacío, no un error', async () => {
    const libro = crearLibro(crearAlmacenEnMemoria())
    expect(await libro.leer('cuentas')).toEqual([])
  })

  it('el caché evita el segundo viaje al almacén', async () => {
    const almacen = crearAlmacenEnMemoria()
    almacen.sembrar('cuentas', [cuenta({ name: 'Banco' })])
    const libro = crearLibro(almacen)

    await libro.leer('cuentas')
    await libro.leer('cuentas')

    expect(almacen.llamadas.obtener).toBe(1)
  })

  it('invalidar() obliga a releer', async () => {
    const almacen = crearAlmacenEnMemoria()
    almacen.sembrar('cuentas', [])
    const libro = crearLibro(almacen)

    await libro.leer('cuentas')
    libro.invalidar()
    await libro.leer('cuentas')

    expect(almacen.llamadas.obtener).toBe(2)
  })
})

describe('escritura', () => {
  it('crea el bloque cuando todavía no existe', async () => {
    const almacen = crearAlmacenEnMemoria()
    const libro = crearLibro(almacen)

    await libro.mutar('cuentas', (c) => [...c, cuenta({ name: 'Banco' })])

    expect(almacen.espiar<CuentaGuardada[]>('cuentas')).toHaveLength(1)
  })
})

// --- El lazo de conflictos: el test que justifica todo el diseño -------------

describe('conflictos entre dispositivos', () => {
  it('NO pisa lo que escribió el otro dispositivo', async () => {
    let inyectado = false
    const almacen = crearAlmacenEnMemoria({
      antesDeGuardar: () => {
        if (inyectado) return
        inyectado = true
        // La laptop guarda "Banco" justo entre nuestra lectura y nuestra
        // escritura. Es la carrera real, provocada a mano.
        almacen.sembrar('cuentas', [cuenta({ id: 'laptop', name: 'Banco' })])
      },
    })
    const libro = crearLibro(almacen)

    // El teléfono agrega "Efectivo" sin saber nada de lo anterior.
    await libro.mutar('cuentas', (c) => [
      ...c,
      cuenta({ id: 'telefono', name: 'Efectivo' }),
    ])

    const final = almacen.espiar<CuentaGuardada[]>('cuentas')!
    expect(final.map((c) => c.id).sort()).toEqual(['laptop', 'telefono'])
    // Sin esto el test pasaria igual si nunca hubiera habido conflicto.
    expect(almacen.llamadas.guardar).toBe(2)
  })

  it('el caché queda consistente con lo que quedó escrito', async () => {
    let inyectado = false
    const almacen = crearAlmacenEnMemoria({
      antesDeGuardar: () => {
        if (inyectado) return
        inyectado = true
        almacen.sembrar('cuentas', [cuenta({ id: 'otro' })])
      },
    })
    const libro = crearLibro(almacen)

    await libro.mutar('cuentas', (c) => [...c, cuenta({ id: 'mio' })])

    // Sin releer: lo que el libro tiene en memoria tiene que ser lo de disco.
    expect((await libro.leer('cuentas')).map((c) => c.id).sort()).toEqual([
      'mio',
      'otro',
    ])
  })

  it('se rinde después de los reintentos en vez de pisar', async () => {
    // Un escritor que nunca para: cada intento encuentra el bloque cambiado.
    const almacen = crearAlmacenEnMemoria({
      antesDeGuardar: (_clave, intento) => {
        almacen.sembrar('cuentas', [cuenta({ id: `otro-${intento}` })])
      },
    })
    const libro = crearLibro(almacen)

    await expect(
      libro.mutar('cuentas', (c) => [...c, cuenta({ id: 'mio' })])
    ).rejects.toThrow(/conflictos seguidos/)

    // Lo importante no es el mensaje: es que "mío" NO quedó escrito.
    const final = almacen.espiar<CuentaGuardada[]>('cuentas')!
    expect(final.some((c) => c.id === 'mio')).toBe(false)
    expect(almacen.llamadas.guardar).toBe(4)
  })
})

// --- El contrato de pureza ---------------------------------------------------

describe('contrato de pureza de `cambio`', () => {
  /**
   * Este par de tests existe para documentar el filo del cuchillo. Es
   * exactamente el reemplazo del `unique (user_id, name)` de la tabla
   * `accounts`, y la forma natural de escribirlo es la que rompe.
   */
  it('decidir la unicidad AFUERA duplica cuando hay conflicto', async () => {
    let inyectado = false
    const almacen = crearAlmacenEnMemoria({
      antesDeGuardar: () => {
        if (inyectado) return
        inyectado = true
        almacen.sembrar('cuentas', [cuenta({ name: 'Banco' })])
      },
    })
    almacen.sembrar('cuentas', [])
    const libro = crearLibro(almacen)

    // Se lee, se decide, y recién después se muta. El reintento vuelve a
    // aplicar el cambio con esta decisión ya vieja.
    const actuales = await libro.leer('cuentas')
    const yaExiste = actuales.some((c) => c.name === 'Banco')

    await libro.mutar('cuentas', (c) =>
      yaExiste ? c : [...c, cuenta({ name: 'Banco' })]
    )

    const final = almacen.espiar<CuentaGuardada[]>('cuentas')!
    expect(final.filter((c) => c.name === 'Banco')).toHaveLength(2)
  })

  it('decidir la unicidad ADENTRO aguanta el conflicto', async () => {
    let inyectado = false
    const almacen = crearAlmacenEnMemoria({
      antesDeGuardar: () => {
        if (inyectado) return
        inyectado = true
        almacen.sembrar('cuentas', [cuenta({ name: 'Banco' })])
      },
    })
    almacen.sembrar('cuentas', [])
    const libro = crearLibro(almacen)

    await libro.mutar('cuentas', (c) =>
      c.some((x) => x.name === 'Banco') ? c : [...c, cuenta({ name: 'Banco' })]
    )

    const final = almacen.espiar<CuentaGuardada[]>('cuentas')!
    expect(final.filter((c) => c.name === 'Banco')).toHaveLength(1)
  })
})

// --- Shards ------------------------------------------------------------------

describe('movimientos por rango', () => {
  it('junta los shards que toca el rango y recorta los bordes', async () => {
    const almacen = crearAlmacenEnMemoria()
    almacen.sembrar(
      claveDeShard(2025),
      shard({
        anio: 2025,
        movimientos: [
          mov({ id: 'nov25', date: '2025-11-15' }),
          mov({ id: 'dic25', date: '2025-12-20' }),
        ],
      })
    )
    almacen.sembrar(
      claveDeShard(2026),
      shard({
        anio: 2026,
        movimientos: [
          mov({ id: 'ene26', date: '2026-01-10' }),
          mov({ id: 'mar26', date: '2026-03-02' }),
        ],
      })
    )
    const libro = crearLibro(almacen)

    const resultado = await libro.movimientos('2025-12-01', '2026-01-31')

    expect(resultado.map((m) => m.id)).toEqual(['dic25', 'ene26'])
  })

  it('un rango sin shards no explota', async () => {
    const libro = crearLibro(crearAlmacenEnMemoria())
    expect(await libro.movimientos('2030-01-01', '2030-12-31')).toEqual([])
  })
})

// --- Saldos derivados: el reemplazo del trigger ------------------------------

describe('saldos derivados', () => {
  it('INCOME suma, EXPENSE y TRANSFER restan, sobre la apertura', async () => {
    const almacen = crearAlmacenEnMemoria()
    almacen.sembrar(
      claveDeShard(2026),
      shard({
        aperturas: { c1: 1000 },
        movimientos: [
          mov({ type: 'INCOME', amount: 500, date: '2026-02-01' }),
          mov({ type: 'EXPENSE', amount: 200, date: '2026-03-01' }),
          mov({ type: 'TRANSFER', amount: 100, date: '2026-04-01' }),
        ],
      })
    )
    const libro = crearLibro(almacen)

    expect(await libro.saldos('2026-06-30')).toEqual({ c1: 1200 })
  })

  it('las cuotas futuras no descuentan todavía', async () => {
    const almacen = crearAlmacenEnMemoria()
    almacen.sembrar(
      claveDeShard(2026),
      shard({
        aperturas: { c1: 0 },
        movimientos: [
          // Un plan de 3 cuotas de 100 cargado en junio: sólo la primera
          // afectó el saldo. Sin el corte por fecha, esto daría -300.
          mov({ amount: 100, date: '2026-06-01', installment_current: 1 }),
          mov({ amount: 100, date: '2026-07-01', installment_current: 2 }),
          mov({ amount: 100, date: '2026-08-01', installment_current: 3 }),
        ],
      })
    )
    const libro = crearLibro(almacen)

    expect(await libro.saldos('2026-06-30')).toEqual({ c1: -100 })
  })

  it('una cuenta sin apertura arranca en cero, no en undefined', async () => {
    const almacen = crearAlmacenEnMemoria()
    almacen.sembrar(
      claveDeShard(2026),
      shard({
        aperturas: {},
        movimientos: [mov({ account_id: 'nueva', type: 'INCOME', amount: 50 })],
      })
    )
    const libro = crearLibro(almacen)

    expect(await libro.saldos('2026-12-31')).toEqual({ nueva: 50 })
  })
})

// --- El diario ---------------------------------------------------------------

describe('diario de intenciones', () => {
  it('anota antes de ejecutar y limpia al terminar', async () => {
    const almacen = crearAlmacenEnMemoria()
    const libro = crearLibro(almacen)
    let habiaIntencionDurante = false

    await libro.diferir('borrar-cuenta', { id: 'c1' }, async () => {
      const m = almacen.espiar<Manifiesto>(CLAVE_MANIFIESTO)
      habiaIntencionDurante = m?.pendiente?.operacion === 'borrar-cuenta'
    })

    expect(habiaIntencionDurante).toBe(true)
    expect(almacen.espiar<Manifiesto>(CLAVE_MANIFIESTO)?.pendiente).toBeNull()
  })

  it('si la operación falla, la intención queda para reanudar', async () => {
    const almacen = crearAlmacenEnMemoria()
    const libro = crearLibro(almacen)

    await expect(
      libro.diferir('borrar-cuenta', { id: 'c1' }, async () => {
        throw new Error('se cortó la red')
      })
    ).rejects.toThrow('se cortó la red')

    const pendiente = almacen.espiar<Manifiesto>(CLAVE_MANIFIESTO)?.pendiente
    expect(pendiente?.operacion).toBe('borrar-cuenta')
    expect(pendiente?.parametros).toEqual({ id: 'c1' })
  })
})
