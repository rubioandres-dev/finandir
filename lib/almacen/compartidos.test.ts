/**
 * Tests del gasto compartido cifrado.
 *
 * El que manda es el de la fila que vuelve de la base: un gasto escrito cifrado
 * y leído de vuelta tiene que dar EXACTAMENTE el mismo objeto que uno en claro.
 * Si eso no se cumple, los saldos dan distinto según cuándo se cargó el gasto,
 * que es la peor forma de romper esto: sin error y sin ruido.
 */

import { describe, expect, it } from 'vitest'
import {
  abrirEspacio,
  abrirGasto,
  abrirObjetivo,
  abrirPago,
  cifrarGasto,
  cifrarObjetivo,
  cifrarPago,
  payloadDelGasto,
  payloadDelObjetivo,
  payloadDelPago,
} from './compartidos'
import { crearClaveDeGrupo } from './grupos'
import { calcularBalances, type GastoCompartido } from '../shared-expenses-service'

const GASTO: GastoCompartido = {
  id: 'g1',
  space_id: 's1',
  paid_by_member_id: 'm1',
  category_id: 'cat-1',
  categoria: { nombre: 'Comida', icono: '🍽️', color: '#f00' },
  split_type: 'EQUAL',
  amount: 12345.67,
  description: 'Cena del viernes',
  date: '2026-03-12',
  repartos: [
    { member_id: 'm1', percentage: 50, amount_owed: 6172.84, is_settled: false },
    { member_id: 'm2', percentage: 50, amount_owed: 6172.83, is_settled: false },
  ],
}

/** La fila tal como la devolvería PostgREST para un gasto ya cifrado. */
async function filaCifrada(gek: CryptoKey, gasto: GastoCompartido, generacion = 1) {
  return {
    id: gasto.id,
    space_id: gasto.space_id,
    paid_by_member_id: gasto.paid_by_member_id,
    date: gasto.date,
    generacion,
    payload_cifrado: await cifrarGasto(gek, payloadDelGasto(gasto)),
    // Lo que el servidor ya no escribe.
    amount: null,
    description: null,
    category_id: null,
    category_name: null,
    split_type: null,
    shared_splits: [],
  }
}

/** La fila vieja: todo legible y los repartos en su propia tabla. */
function filaEnClaro(gasto: GastoCompartido) {
  return {
    id: gasto.id,
    space_id: gasto.space_id,
    paid_by_member_id: gasto.paid_by_member_id,
    date: gasto.date,
    generacion: null,
    payload_cifrado: null,
    amount: String(gasto.amount), // numeric llega como string
    description: gasto.description,
    category_id: gasto.category_id,
    category_name: gasto.categoria?.nombre ?? null,
    category_icon: gasto.categoria?.icono ?? null,
    category_color: gasto.categoria?.color ?? null,
    split_type: gasto.split_type,
    shared_splits: gasto.repartos.map((r) => ({
      member_id: r.member_id,
      percentage: String(r.percentage),
      amount_owed: String(r.amount_owed),
      is_settled: r.is_settled,
    })),
  }
}

describe('gasto compartido', () => {
  it('ida y vuelta por el sobre devuelve el mismo gasto', async () => {
    const gek = await crearClaveDeGrupo()
    const { gasto, enClaro } = await abrirGasto(gek, await filaCifrada(gek, GASTO))

    expect(gasto).toEqual(GASTO)
    expect(enClaro).toBe(false)
  })

  it('la fila vieja en claro da el MISMO gasto que la cifrada', async () => {
    const gek = await crearClaveDeGrupo()

    const desdeCifrado = await abrirGasto(gek, await filaCifrada(gek, GASTO))
    const desdeClaro = await abrirGasto(gek, filaEnClaro(GASTO))

    expect(desdeClaro.gasto).toEqual(desdeCifrado.gasto)
    expect(desdeClaro.enClaro).toBe(true)
  })

  it('otra llave no abre el gasto', async () => {
    const gek = await crearClaveDeGrupo()
    const ajena = await crearClaveDeGrupo()

    await expect(abrirGasto(ajena, await filaCifrada(gek, GASTO))).rejects.toThrow()
  })

  it('el payload no deja el importe ni la descripcion a la vista', async () => {
    const gek = await crearClaveDeGrupo()
    const fila = await filaCifrada(gek, GASTO)
    const texto = JSON.stringify(fila)

    expect(texto).not.toContain('Cena del viernes')
    expect(texto).not.toContain('12345.67')
    expect(texto).not.toContain('Comida')
  })
})

describe('pagos y objetivos', () => {
  it('el pago vuelve igual, venga cifrado o en claro', async () => {
    const gek = await crearClaveDeGrupo()
    const pago = {
      id: 'p1',
      from_member_id: 'm2',
      to_member_id: 'm1',
      amount: 6172.83,
      currency: 'ARS' as const,
      note: 'Transferencia',
      created_at: '2026-03-13T10:00:00Z',
    }

    const cifrado = await abrirPago(gek, {
      ...pago,
      amount: null,
      note: null,
      generacion: 1,
      payload_cifrado: await cifrarPago(gek, payloadDelPago(pago)),
    })
    const claro = await abrirPago(gek, { ...pago, payload_cifrado: null })

    expect(cifrado.pago).toEqual(pago)
    expect(claro.pago).toEqual(pago)
  })

  it('el objetivo vuelve igual, venga cifrado o en claro', async () => {
    const gek = await crearClaveDeGrupo()
    const objetivo = {
      id: 'o1',
      title: 'Alquiler',
      type: 'CATEGORY_BUDGET' as const,
      category_id: 'cat-1',
      categoria: { nombre: 'Casa', icono: '🏠', color: '#0f0' },
      target_amount: 500000,
      monthly_contribution: null,
      target_date: null,
      currency: 'ARS' as const,
    }

    const cifrado = await abrirObjetivo(gek, {
      ...objetivo,
      title: null,
      target_amount: null,
      category_name: null,
      generacion: 1,
      payload_cifrado: await cifrarObjetivo(gek, payloadDelObjetivo(objetivo)),
    })
    const claro = await abrirObjetivo(gek, {
      ...objetivo,
      category_name: objetivo.categoria.nombre,
      category_icon: objetivo.categoria.icono,
      category_color: objetivo.categoria.color,
      payload_cifrado: null,
    })

    expect(cifrado.objetivo).toEqual(objetivo)
    expect(claro.objetivo).toEqual(objetivo)
  })
})

describe('abrir el espacio entero', () => {
  it('lee generaciones mezcladas y marca lo que sigue en claro', async () => {
    const vieja = await crearClaveDeGrupo()
    const nueva = await crearClaveDeGrupo()
    const llaves = new Map([
      [1, vieja],
      [2, nueva],
    ])

    const antes = { ...GASTO, id: 'antes' }
    const despues = { ...GASTO, id: 'despues', description: 'Después de rotar' }
    const legado = { ...GASTO, id: 'legado' }

    const abierto = await abrirEspacio(
      {
        gastos: [
          await filaCifrada(vieja, antes, 1),
          await filaCifrada(nueva, despues, 2),
          filaEnClaro(legado),
        ],
        liquidaciones: [],
        objetivos: [],
      },
      llaves
    )

    expect(abierto.gastos.map((g) => g.id)).toEqual(['antes', 'despues', 'legado'])
    expect(abierto.pendientesDeCifrar.gastos).toEqual(['legado'])
  })

  it('un sobre roto saltea ese gasto y no tumba el grupo', async () => {
    const gek = await crearClaveDeGrupo()
    const ajena = await crearClaveDeGrupo()

    const abierto = await abrirEspacio(
      {
        gastos: [
          await filaCifrada(gek, { ...GASTO, id: 'bueno' }),
          await filaCifrada(ajena, { ...GASTO, id: 'roto' }),
        ],
        liquidaciones: [],
        objetivos: [],
      },
      new Map([[1, gek]])
    )

    expect(abierto.gastos.map((g) => g.id)).toEqual(['bueno'])
  })

  it('sin la llave de esa generacion, esa fila no aparece', async () => {
    const vieja = await crearClaveDeGrupo()
    const nueva = await crearClaveDeGrupo()

    const abierto = await abrirEspacio(
      {
        gastos: [
          await filaCifrada(vieja, { ...GASTO, id: 'antes' }, 1),
          await filaCifrada(nueva, { ...GASTO, id: 'despues' }, 2),
        ],
        liquidaciones: [],
        objetivos: [],
      },
      // Un expulsado se queda con la generación vieja y nada más.
      new Map([[1, vieja]])
    )

    expect(abierto.gastos.map((g) => g.id)).toEqual(['antes'])
  })

  it('los saldos dan lo mismo con el grupo cifrado que en claro', async () => {
    const gek = await crearClaveDeGrupo()
    const miembros = ['m1', 'm2']

    const cifrado = await abrirEspacio(
      { gastos: [await filaCifrada(gek, GASTO)], liquidaciones: [], objetivos: [] },
      new Map([[1, gek]])
    )

    expect(calcularBalances(cifrado.gastos, miembros)).toEqual(
      calcularBalances([GASTO], miembros)
    )
  })
})
