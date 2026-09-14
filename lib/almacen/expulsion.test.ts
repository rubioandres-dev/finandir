/**
 * Test de la expulsión, de punta a punta.
 *
 * Es LA prueba de los grupos cifrados. Todo lo demás puede andar y, si esto
 * falla, echar a alguien de un grupo no significa nada: sigue leyendo los
 * gastos con la llave que se llevó. Y falla en silencio, porque en la pantalla
 * el miembro ya no aparece.
 */

import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { crearSobre } from './cripto'
import { abrirParDeClaves, crearParDeClaves } from './grupos'
import { abrirEspacio, cifrarGasto, payloadDelGasto } from './compartidos'
import { clavesDelEspacio, estrenarClaveDeEspacio, darAccesoAlMiembro } from './espacios'
import { expulsarDelGrupo } from './expulsion'
import { cargarEspacioCrudo, type GastoCompartido } from '../shared-expenses-service'

const RAPIDO = 1_000

async function usuario() {
  const { claves } = await crearSobre('x', RAPIDO)
  const par = await crearParDeClaves(claves)
  return {
    publica: par.publica,
    privada: await abrirParDeClaves(par.privadaEnvuelta, claves),
  }
}

type Fila = Record<string, unknown>

/**
 * Supabase de mentira con las tablas del grupo.
 *
 * No simula la RLS a propósito: si simulara los permisos, el test pasaría por
 * las políticas y no por la criptografía. Acá el expulsado ve TODAS las filas —
 * el peor caso, un atacante con la base entera — y tiene que seguir sin poder
 * leerlas.
 */
function supabaseFalso() {
  const tablas: Record<string, Fila[]> = {
    shared_spaces: [{ id: 'e1', generacion: 1 }],
    shared_space_members: [],
    shared_space_claves: [],
    shared_transactions: [],
    shared_settlements: [],
    shared_goals: [],
    shared_splits: [],
  }

  function consulta(filas: Fila[], donde: Fila = {}, orden: string | null = null) {
    function resultado() {
      const r = filas.filter((f) => Object.entries(donde).every(([k, v]) => f[k] === v))
      if (orden) r.sort((a, b) => Number(b[orden] ?? 0) - Number(a[orden] ?? 0))
      return r
    }

    const api = {
      eq: (col: string, valor: unknown) => consulta(filas, { ...donde, [col]: valor }, orden),
      order: (col: string) => consulta(filas, donde, col),
      limit: () => api,
      maybeSingle: async () => ({ data: resultado()[0] ?? null, error: null }),
      then: (r: (v: { data: Fila[]; error: null; count: number }) => unknown) =>
        r({ data: resultado(), error: null, count: resultado().length }),
    }
    return api
  }

  const cliente = {
    from(nombre: string) {
      const tabla = tablas[nombre]
      return {
        select: () => consulta(tabla),
        async insert(filas: Fila | Fila[]) {
          for (const f of Array.isArray(filas) ? filas : [filas]) tabla.push(f)
          return { error: null }
        },
        async upsert(filas: Fila | Fila[]) {
          for (const f of Array.isArray(filas) ? filas : [filas]) tabla.push(f)
          return { error: null }
        },
        update: (cambios: Fila) => ({
          async eq(col: string, valor: unknown) {
            for (const f of tabla) if (f[col] === valor) Object.assign(f, cambios)
            return { error: null }
          },
        }),
        delete: () => ({
          async eq(col: string, valor: unknown) {
            const i = tabla.findIndex((f) => f[col] === valor)
            if (i >= 0) tabla.splice(i, 1)
            return { error: null }
          },
          async in(col: string, valores: unknown[]) {
            for (let i = tabla.length - 1; i >= 0; i--) {
              if (valores.includes(tabla[i][col])) tabla.splice(i, 1)
            }
            return { error: null }
          },
        }),
      }
    },
  }

  return { cliente: cliente as unknown as SupabaseClient, tablas }
}

const GASTO: GastoCompartido = {
  id: 'g1',
  space_id: 'e1',
  paid_by_member_id: 'm1',
  category_id: null,
  categoria: null,
  split_type: 'EQUAL',
  amount: 9000,
  description: 'Alquiler de marzo',
  date: '2026-03-01',
  repartos: [
    { member_id: 'm1', percentage: 50, amount_owed: 4500, is_settled: false },
    { member_id: 'm2', percentage: 50, amount_owed: 4500, is_settled: false },
  ],
}

/** Un grupo con dos miembros, la llave estrenada y un gasto cifrado adentro. */
async function grupoConDos() {
  const fake = supabaseFalso()
  const ana = await usuario()
  const beto = await usuario()

  fake.tablas.shared_space_members.push(
    { id: 'm1', space_id: 'e1', user_id: 'u1', role: 'ADMIN', clave_publica: ana.publica },
    { id: 'm2', space_id: 'e1', user_id: 'u2', role: 'MEMBER', clave_publica: beto.publica }
  )

  const gek = await estrenarClaveDeEspacio(fake.cliente, 'e1', 'm1', ana.publica)
  await darAccesoAlMiembro(fake.cliente, 'e1', 1, gek, {
    memberId: 'm2',
    publica: beto.publica,
  })

  fake.tablas.shared_transactions.push({
    id: GASTO.id,
    space_id: 'e1',
    paid_by_member_id: 'm1',
    date: GASTO.date,
    generacion: 1,
    payload_cifrado: await cifrarGasto(gek, payloadDelGasto(GASTO)),
    amount: null,
    description: null,
    shared_splits: [],
  })

  return { fake, ana, beto, gek }
}

describe('expulsar de un grupo cifrado', () => {
  it('antes de expulsar, los dos leen el gasto', async () => {
    const { fake, ana, beto } = await grupoConDos()
    const { crudo } = await cargarEspacioCrudo(fake.cliente, 'e1')

    for (const [memberId, quien] of [
      ['m1', ana],
      ['m2', beto],
    ] as const) {
      const llaves = await clavesDelEspacio(fake.cliente, 'e1', memberId, quien.privada)
      const abierto = await abrirEspacio(crudo, llaves)
      expect(abierto.gastos[0].description).toBe('Alquiler de marzo')
    }
  })

  it('después de expulsar, el que se fue no lee NADA', async () => {
    const { fake, ana, beto } = await grupoConDos()

    const llavesDeAna = await clavesDelEspacio(fake.cliente, 'e1', 'm1', ana.privada)
    await expulsarDelGrupo(fake.cliente, {
      spaceId: 'e1',
      memberIdExpulsado: 'm2',
      generacionActual: 1,
      llaves: llavesDeAna,
      quedan: [{ memberId: 'm1', publica: ana.publica }],
    })

    // Beto conserva la llave vieja: es lo que se lleva en su navegador y no hay
    // forma de quitársela. Lo que tiene que fallar es abrir con ella.
    const llavesDeBeto = await clavesDelEspacio(fake.cliente, 'e1', 'm2', beto.privada)
    const { crudo } = await cargarEspacioCrudo(fake.cliente, 'e1')
    const loQueVeBeto = await abrirEspacio(crudo, llavesDeBeto)

    expect(loQueVeBeto.gastos).toEqual([])
  })

  it('después de expulsar, el que queda sigue leyendo todo', async () => {
    const { fake, ana } = await grupoConDos()

    const llavesDeAna = await clavesDelEspacio(fake.cliente, 'e1', 'm1', ana.privada)
    const resultado = await expulsarDelGrupo(fake.cliente, {
      spaceId: 'e1',
      memberIdExpulsado: 'm2',
      generacionActual: 1,
      llaves: llavesDeAna,
      quedan: [{ memberId: 'm1', publica: ana.publica }],
    })

    expect(resultado.generacion).toBe(2)
    expect(resultado.recifradas).toBe(1)

    const nuevas = await clavesDelEspacio(fake.cliente, 'e1', 'm1', ana.privada)
    const { crudo } = await cargarEspacioCrudo(fake.cliente, 'e1')
    const abierto = await abrirEspacio(crudo, nuevas)

    expect(abierto.gastos[0].description).toBe('Alquiler de marzo')
    expect(abierto.gastos[0].amount).toBe(9000)
  })

  it('el gasto queda escrito con la generación nueva, no con la vieja', async () => {
    const { fake, ana } = await grupoConDos()

    const llaves = await clavesDelEspacio(fake.cliente, 'e1', 'm1', ana.privada)
    await expulsarDelGrupo(fake.cliente, {
      spaceId: 'e1',
      memberIdExpulsado: 'm2',
      generacionActual: 1,
      llaves,
      quedan: [{ memberId: 'm1', publica: ana.publica }],
    })

    expect(fake.tablas.shared_transactions[0].generacion).toBe(2)
    expect(fake.tablas.shared_spaces[0].generacion).toBe(2)
  })

  it('no se rota si no queda nadie a quien darle la llave', async () => {
    const { fake, ana } = await grupoConDos()
    const llaves = await clavesDelEspacio(fake.cliente, 'e1', 'm1', ana.privada)

    await expect(
      expulsarDelGrupo(fake.cliente, {
        spaceId: 'e1',
        memberIdExpulsado: 'm2',
        generacionActual: 1,
        llaves,
        quedan: [],
      })
    ).rejects.toThrow()

    // Y el grupo queda como estaba: ni llave nueva ni miembro borrado.
    expect(fake.tablas.shared_spaces[0].generacion).toBe(1)
    expect(fake.tablas.shared_space_members).toHaveLength(2)
  })
})

describe('cuando el borrado no surte efecto', () => {
  /**
   * El caso que encontró el test contra la base real: la policy de la 015 no
   * dejaba a un admin sacar a alguien con cuenta, y PostgREST devuelve éxito al
   * borrar cero filas.
   *
   * Si eso pasa en silencio, la expulsión se DESHACE SOLA: queda un miembro sin
   * llave de la generación vigente, y el reparto automático se la da la próxima
   * vez que un admin abre el grupo.
   */
  it('falla fuerte en vez de rotar y dejar al expulsado adentro', async () => {
    const { fake, ana, beto } = await grupoConDos()

    // Una base que acepta el DELETE y no borra nada, como la RLS vieja.
    const real = fake.cliente.from.bind(fake.cliente)
    ;(fake.cliente as unknown as { from: (n: string) => unknown }).from = (nombre: string) => {
      const tabla = real(nombre)
      if (nombre !== 'shared_space_members') return tabla
      return { ...tabla, delete: () => ({ eq: async () => ({ error: null }) }) }
    }

    const llaves = await clavesDelEspacio(fake.cliente, 'e1', 'm1', ana.privada)

    await expect(
      expulsarDelGrupo(fake.cliente, {
        spaceId: 'e1',
        memberIdExpulsado: 'm2',
        generacionActual: 1,
        llaves,
        quedan: [{ memberId: 'm1', publica: ana.publica }],
      })
    ).rejects.toThrow(/administrador|024/)

    // Y sobre todo: NO rotó. Beto sigue leyendo, que es la verdad — echarlo no
    // funcionó. Lo grave habría sido decir que sí.
    const deBeto = await clavesDelEspacio(fake.cliente, 'e1', 'm2', beto.privada)
    const { crudo } = await cargarEspacioCrudo(fake.cliente, 'e1')
    expect((await abrirEspacio(crudo, deBeto)).gastos).toHaveLength(1)
    expect(fake.tablas.shared_spaces[0].generacion).toBe(1)
  })
})

describe('el legado en claro', () => {
  it('al expulsar, un gasto que estaba legible queda cifrado y sin copia', async () => {
    const { fake, ana, beto } = await grupoConDos()

    // Un gasto de antes del cifrado: columnas legibles y repartos aparte.
    fake.tablas.shared_transactions.push({
      id: 'viejo',
      space_id: 'e1',
      paid_by_member_id: 'm1',
      date: '2026-02-01',
      generacion: null,
      payload_cifrado: null,
      amount: '3000',
      description: 'Internet de febrero',
      split_type: 'EQUAL',
      shared_splits: [
        { member_id: 'm1', percentage: '50', amount_owed: '1500', is_settled: false },
      ],
    })
    fake.tablas.shared_splits.push({ transaction_id: 'viejo', member_id: 'm1' })

    const llaves = await clavesDelEspacio(fake.cliente, 'e1', 'm1', ana.privada)
    await expulsarDelGrupo(fake.cliente, {
      spaceId: 'e1',
      memberIdExpulsado: 'm2',
      generacionActual: 1,
      llaves,
      quedan: [{ memberId: 'm1', publica: ana.publica }],
    })

    const fila = fake.tablas.shared_transactions.find((f) => f.id === 'viejo')
    expect(fila?.description).toBeNull()
    expect(fila?.amount).toBeNull()
    expect(fila?.payload_cifrado).toEqual(expect.stringMatching(/^v1\./))
    expect(fake.tablas.shared_splits).toEqual([])

    // Y el expulsado tampoco lo lee, aunque antes estuviera a la vista.
    const deBeto = await clavesDelEspacio(fake.cliente, 'e1', 'm2', beto.privada)
    const { crudo } = await cargarEspacioCrudo(fake.cliente, 'e1')
    expect((await abrirEspacio(crudo, deBeto)).gastos).toEqual([])
  })
})
