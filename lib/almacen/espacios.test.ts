/**
 * Tests del reparto de llaves de grupo contra la base.
 *
 * El que manda es el de expulsión: despues de rotar, el que se fue no tiene
 * sobre de la generación vigente y no puede abrir lo nuevo. Y hay uno que deja
 * escrito lo que la rotación NO arregla sola.
 */

import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  abrirClaveDelEspacio,
  darAccesoAlMiembro,
  estrenarClaveDeEspacio,
  expulsarYRotar,
  miembrosDelEspacio,
  publicarClavePublica,
} from './espacios'
import { crearSobre } from './cripto'
import {
  abrirParDeClaves,
  cifrarDelGrupo,
  crearParDeClaves,
  descifrarDelGrupo,
  type ClavePublica,
} from './grupos'

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

/** Supabase de mentira: miembros, sobres de grupo y la generacion del espacio. */
function supabaseFalso(miembros: Fila[]) {
  const claves: Fila[] = []
  const espacios: Fila[] = [{ id: 'e1', generacion: 1 }]

  function filtrar(filas: Fila[], donde: Fila) {
    return filas.filter((f) => Object.entries(donde).every(([k, v]) => f[k] === v))
  }

  function consulta(tabla: Fila[], donde: Fila = {}, orden: string | null = null) {
    function filas() {
      const r = filtrar(tabla, donde)
      // La base real ordena; sin esto el fake devolveria la generacion VIEJA y
      // el test pasaria o fallaria por una razon que no es la del codigo.
      if (orden) r.sort((a, b) => Number(b[orden]) - Number(a[orden]))
      return r
    }

    const api = {
      eq(col: string, valor: unknown) {
        return consulta(tabla, { ...donde, [col]: valor }, orden)
      },
      order(col: string) {
        return consulta(tabla, donde, col)
      },
      limit() {
        return api
      },
      async maybeSingle() {
        return { data: filas()[0] ?? null, error: null }
      },
      then(r: (v: { data: Fila[]; error: null }) => unknown) {
        return r({ data: filas(), error: null })
      },
    }
    return api
  }

  const cliente = {
    async rpc(nombre: string, args: Record<string, unknown>) {
      if (nombre !== 'subir_generacion_del_espacio') {
        return { data: null, error: { code: 'PGRST202', message: 'sin funcion' } }
      }
      const espacio = espacios.find((e) => e.id === args.p_space_id)
      if (!espacio) return { data: null, error: { code: 'P0002', message: 'sin espacio' } }
      const pedida = Number(args.p_generacion)
      if (pedida > Number(espacio.generacion)) espacio.generacion = pedida
      return { data: espacio.generacion, error: null }
    },
    from(nombre: string) {
      const tabla =
        nombre === 'shared_space_members'
          ? miembros
          : nombre === 'shared_space_claves'
            ? claves
            : espacios

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
        update(cambios: Fila) {
          return {
            eq(col: string, valor: unknown) {
              const tocadas = tabla.filter((f) => f[col] === valor)
              for (const f of tocadas) Object.assign(f, cambios)
              const salida = { data: tocadas.map((f) => ({ id: f.id })), error: null }
              return {
                select: async () => salida,
                then: (r: (v: { error: null }) => unknown) => r({ error: null }),
              }
            },
          }
        },
        delete() {
          return {
            async eq(col: string, valor: unknown) {
              const i = tabla.findIndex((f) => f[col] === valor)
              if (i >= 0) tabla.splice(i, 1)
              return { error: null }
            },
          }
        },
      }
    },
  }

  return {
    cliente: cliente as unknown as SupabaseClient,
    claves: () => claves,
    espacios: () => espacios,
    miembros: () => miembros,
  }
}

describe('publicar la clave publica', () => {
  it('la escribe en la fila del miembro', async () => {
    const ana = await usuario()
    const fake = supabaseFalso([{ id: 'm1', space_id: 'e1', user_id: 'u1', role: 'ADMIN', clave_publica: null }])

    await publicarClavePublica(fake.cliente, 'm1', ana.publica)

    expect(fake.miembros()[0].clave_publica).toEqual(ana.publica)
  })
})

describe('estrenar un espacio', () => {
  it('el creador queda con la llave y puede leer', async () => {
    const ana = await usuario()
    const fake = supabaseFalso([
      { id: 'm1', space_id: 'e1', user_id: 'u1', role: 'ADMIN', clave_publica: ana.publica },
    ])

    const gek = await estrenarClaveDeEspacio(fake.cliente, 'e1', 'm1', ana.publica)
    const gasto = await cifrarDelGrupo(gek, { monto: 500 })

    const suGek = await abrirClaveDelEspacio(fake.cliente, 'e1', 'm1', ana.privada)
    expect(await descifrarDelGrupo(suGek!, gasto)).toEqual({ monto: 500 })
  })
})

describe('quien esta pendiente', () => {
  it('un miembro sin sobre figura pendiente, y un invitado NO', async () => {
    const ana = await usuario()
    const beto = await usuario()
    const fake = supabaseFalso([
      { id: 'm1', space_id: 'e1', user_id: 'u1', role: 'ADMIN', clave_publica: ana.publica },
      { id: 'm2', space_id: 'e1', user_id: 'u2', role: 'MEMBER', clave_publica: beto.publica },
      // Invitado sin cuenta: es un dato adentro del grupo, no alguien que lee.
      { id: 'm3', space_id: 'e1', user_id: null, role: 'MEMBER', clave_publica: null },
    ])
    await estrenarClaveDeEspacio(fake.cliente, 'e1', 'm1', ana.publica)

    const lista = await miembrosDelEspacio(fake.cliente, 'e1', 1)
    const porId = Object.fromEntries(lista.map((m) => [m.memberId, m]))

    expect(porId.m1.pendiente).toBe(false)
    expect(porId.m2.pendiente).toBe(true)
    expect(porId.m3.pendiente).toBe(false)
  })

  it('deja de estar pendiente cuando un admin le da la llave', async () => {
    const ana = await usuario()
    const beto = await usuario()
    const fake = supabaseFalso([
      { id: 'm1', space_id: 'e1', user_id: 'u1', role: 'ADMIN', clave_publica: ana.publica },
      { id: 'm2', space_id: 'e1', user_id: 'u2', role: 'MEMBER', clave_publica: beto.publica },
    ])

    const gek = await estrenarClaveDeEspacio(fake.cliente, 'e1', 'm1', ana.publica)
    await darAccesoAlMiembro(fake.cliente, 'e1', 1, gek, {
      memberId: 'm2',
      publica: beto.publica as ClavePublica,
    })

    const lista = await miembrosDelEspacio(fake.cliente, 'e1', 1)
    expect(lista.find((m) => m.memberId === 'm2')?.pendiente).toBe(false)

    // Y lee de verdad: la llave que recibio abre lo que cifro el creador.
    const gasto = await cifrarDelGrupo(gek, { monto: 900 })
    const suGek = await abrirClaveDelEspacio(fake.cliente, 'e1', 'm2', beto.privada)
    expect(await descifrarDelGrupo(suGek!, gasto)).toEqual({ monto: 900 })
  })

  it('sin sobre, abrir devuelve null en vez de explotar', async () => {
    const beto = await usuario()
    const fake = supabaseFalso([
      { id: 'm2', space_id: 'e1', user_id: 'u2', role: 'MEMBER', clave_publica: beto.publica },
    ])

    expect(await abrirClaveDelEspacio(fake.cliente, 'e1', 'm2', beto.privada)).toBeNull()
  })
})

describe('expulsar a alguien', () => {
  it('el que se va se queda sin sobre y sin poder leer lo nuevo', async () => {
    const ana = await usuario()
    const carla = await usuario()
    const fake = supabaseFalso([
      { id: 'm1', space_id: 'e1', user_id: 'u1', role: 'ADMIN', clave_publica: ana.publica },
      { id: 'm3', space_id: 'e1', user_id: 'u3', role: 'MEMBER', clave_publica: carla.publica },
    ])

    const gek1 = await estrenarClaveDeEspacio(fake.cliente, 'e1', 'm1', ana.publica)
    await darAccesoAlMiembro(fake.cliente, 'e1', 1, gek1, {
      memberId: 'm3',
      publica: carla.publica as ClavePublica,
    })

    const { generacion, gek } = await expulsarYRotar(
      fake.cliente,
      'e1',
      1,
      [{ memberId: 'm1', publica: ana.publica as ClavePublica }],
      'm3'
    )

    expect(generacion).toBe(2)
    expect(fake.espacios()[0].generacion).toBe(2)
    // Se fue de la tabla de miembros.
    expect(fake.miembros().some((m) => m.id === 'm3')).toBe(false)
    // No hay sobre de la generacion nueva para el.
    expect(
      fake.claves().some((c) => c.member_id === 'm3' && c.generacion === 2)
    ).toBe(false)

    // Y la que queda sigue leyendo.
    const gastoNuevo = await cifrarDelGrupo(gek, { monto: 111 })
    const suGek = await abrirClaveDelEspacio(fake.cliente, 'e1', 'm1', ana.privada)
    expect(await descifrarDelGrupo(suGek!, gastoNuevo)).toEqual({ monto: 111 })
  })

  it('ROTAR NO RE-CIFRA LO VIEJO: eso lo tiene que hacer quien llama', async () => {
    // Queda escrito en un test porque es la diferencia entre "no lee nada mas"
    // y "no puede leer lo que ya vio", y prometer la segunda sin re-cifrar
    // seria mentir.
    const ana = await usuario()
    const carla = await usuario()
    const fake = supabaseFalso([
      { id: 'm1', space_id: 'e1', user_id: 'u1', role: 'ADMIN', clave_publica: ana.publica },
      { id: 'm3', space_id: 'e1', user_id: 'u3', role: 'MEMBER', clave_publica: carla.publica },
    ])

    const gek1 = await estrenarClaveDeEspacio(fake.cliente, 'e1', 'm1', ana.publica)
    await darAccesoAlMiembro(fake.cliente, 'e1', 1, gek1, {
      memberId: 'm3',
      publica: carla.publica as ClavePublica,
    })

    const gastoViejo = await cifrarDelGrupo(gek1, { monto: 300 })
    const suGekVieja = await abrirClaveDelEspacio(fake.cliente, 'e1', 'm3', carla.privada)

    await expulsarYRotar(
      fake.cliente,
      'e1',
      1,
      [{ memberId: 'm1', publica: ana.publica as ClavePublica }],
      'm3'
    )

    // Con la llave que ya tenia en la mano, lo viejo sin re-cifrar sigue
    // abriendose. Por eso `expulsarYRotar` devuelve la GEK nueva.
    expect(await descifrarDelGrupo(suGekVieja!, gastoViejo)).toEqual({ monto: 300 })
  })
})
