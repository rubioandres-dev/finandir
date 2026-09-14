/**
 * Tests de activar y desactivar Bóveda.
 *
 * Es la operación que puede perder las finanzas de alguien, así que lo que se
 * prueba no es el camino feliz: es que CADA falla deje al usuario exactamente
 * donde estaba, con el puntero sin mover y los datos viejos intactos.
 */

import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { activarBoveda, volverAEstandar } from './activacion'
import { libroDelNavegador } from './acceso'
import { abrirConContrasena, abrirConRecuperacion, type SobreDeClaves } from './cripto'
import { todosLosMovimientos } from './consultas'

type Fila = Record<string, unknown>

type Opciones = {
  /** Hace fallar la escritura del bloque numero N. */
  fallarBloqueEn?: number
  /** Rompe el saldo guardado para que la verificacion no cierre. */
  saldoFalso?: number
}

/**
 * Supabase de mentira con las tres cosas que toca la activacion: las tablas
 * relacionales de origen, los bloques cifrados de destino, y el puntero.
 */
function supabaseFalso(opciones: Opciones = {}) {
  const bloques = new Map<string, { contenido: string; version: number }>()
  let sobre: SobreDeClaves | null = null
  let backend = 'SUPABASE'
  let escrituras = 0

  const relacionales: Record<string, Fila[]> = {
    accounts: [
      {
        id: 'c1',
        user_id: 'u1',
        name: 'Banco',
        type: 'BANK',
        currency: 'ARS',
        balance: String(opciones.saldoFalso ?? 700),
        is_liquid: true,
        created_at: '2025-01-01T00:00:00Z',
      },
    ],
    categories: [
      { id: 'cat1', user_id: 'u1', name: 'Comida', type: 'EXPENSE', is_custom: true },
    ],
    transactions: [
      {
        id: 't1', user_id: 'u1', account_id: 'c1', amount: '1000.00',
        type: 'INCOME', date: '2026-01-05', currency: 'ARS',
      },
      {
        id: 't2', user_id: 'u1', account_id: 'c1', amount: '300.00',
        type: 'EXPENSE', date: '2026-02-05', currency: 'ARS', category_id: 'cat1',
      },
    ],
    user_profiles: [{ user_id: 'u1', display_name: 'Ana', selected_currencies: ['ARS'] }],
  }

  const cliente = {
    from(tabla: string) {
      if (tabla === 'almacen_bloques') {
        return {
          select() {
            return {
              eq(_col: string, clave: string) {
                return {
                  async maybeSingle() {
                    const b = bloques.get(clave)
                    return { data: b ? { contenido: b.contenido, version: b.version } : null, error: null }
                  },
                }
              },
            }
          },
        }
      }

      if (tabla === 'almacen_sobres') {
        return {
          select: () => ({ maybeSingle: async () => ({ data: sobre ? { sobre } : null, error: null }) }),
          upsert: async (fila: { sobre: SobreDeClaves }) => {
            sobre = fila.sobre
            return { error: null }
          },
        }
      }

      if (tabla === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { storage_backend: backend }, error: null }) }),
          }),
          upsert: async (fila: Fila) => {
            if (fila.storage_backend) backend = fila.storage_backend as string
            return { error: null }
          },
        }
      }

      // Tablas relacionales: lectura para el migrador, escritura para la vuelta.
      const conOrden = {
        data: relacionales[tabla] ?? null,
        error: relacionales[tabla] ? null : { code: 'PGRST205', message: 'no existe' },
      }
      return {
        select: () => ({
          ...conOrden,
          order: () => ({ ...conOrden, limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          gte: () => ({ lte: () => ({ order: () => ({ order: () => conOrden }) }) }),
          then: (r: (v: typeof conOrden) => unknown) => r(conOrden),
        }),
        upsert: async (filas: Fila[]) => {
          relacionales[tabla] = [
            ...(relacionales[tabla] ?? []).filter(
              (v) => !filas.some((n) => n.id === v.id)
            ),
            ...filas,
          ]
          return { error: null }
        },
        delete: () => ({ in: async () => ({ error: null }) }),
      }
    },

    async rpc(_nombre: string, args: Record<string, unknown>) {
      escrituras += 1
      if (opciones.fallarBloqueEn === escrituras) {
        return { data: null, error: { message: 'se corto la red', code: 'XX000' } }
      }

      const clave = args.p_clave as string
      const esperada = args.p_version_esperada as number | null
      const actual = bloques.get(clave)

      if (esperada === null && actual) return { data: null, error: null }
      if (esperada !== null && actual?.version !== esperada) return { data: null, error: null }

      const version = (actual?.version ?? 0) + 1
      bloques.set(clave, { contenido: args.p_contenido as string, version })
      return { data: version, error: null }
    },
  }

  return {
    cliente: cliente as unknown as SupabaseClient,
    backend: () => backend,
    sobre: () => sobre,
    bloques: () => bloques,
    relacionales: () => relacionales,
  }
}

describe('activar Bóveda', () => {
  it('copia los datos, verifica y recién ahí mueve el puntero', async () => {
    const fake = supabaseFalso()

    const r = await activarBoveda(fake.cliente, 'u1', 'mi-contrasena')

    expect(r.ok).toBe(true)
    expect(fake.backend()).toBe('NUBE')
    if (!r.ok) return

    expect(r.resumen.movimientos).toBe(2)
    expect(r.codigoDeRecuperacion).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/)

    // Y los datos se leen de verdad con esas claves.
    const libro = await libroDelNavegador(fake.cliente, r.claves)
    expect((await libro.leer('cuentas')).map((c) => c.id)).toEqual(['c1'])
    expect(await libro.saldos('2026-12-31')).toEqual({ c1: 700 })
  })

  it('en disco no queda nada legible', async () => {
    const fake = supabaseFalso()
    await activarBoveda(fake.cliente, 'u1', 'x')

    const todo = [...fake.bloques().values()].map((b) => b.contenido).join('')
    expect(todo).not.toContain('Banco')
    expect(todo).not.toContain('Comida')
    expect(todo).not.toContain('1000')
  })

  it('SI LA VERIFICACION NO CIERRA, el puntero no se mueve', async () => {
    // `accounts.balance` dice 999 pero los movimientos suman 700: el modelo de
    // saldos derivados no reproduce lo que habia, asi que no se activa nada.
    const fake = supabaseFalso({ saldoFalso: 999 })

    const r = await activarBoveda(fake.cliente, 'u1', 'x')

    expect(r.ok).toBe(false)
    expect(fake.backend()).toBe('SUPABASE')
    if (r.ok) return
    expect(r.discrepancias).toHaveLength(1)
    expect(r.error).toContain('siguen como estaban')
  })

  it('si se corta la escritura, el puntero tampoco se mueve', async () => {
    const fake = supabaseFalso({ fallarBloqueEn: 2 })

    const r = await activarBoveda(fake.cliente, 'u1', 'x')

    expect(r.ok).toBe(false)
    // Lo que importa: sigue leyendo de las tablas de siempre, intactas.
    expect(fake.backend()).toBe('SUPABASE')
    expect(fake.relacionales().transactions).toHaveLength(2)
  })

  it('el código de recuperación abre los datos, no sólo la contraseña', async () => {
    const fake = supabaseFalso()
    const r = await activarBoveda(fake.cliente, 'u1', 'la-contrasena')
    if (!r.ok) throw new Error('tenia que activar')

    const sobre = fake.sobre()!
    await expect(abrirConContrasena(sobre, 'la-contrasena')).resolves.toBeDefined()
    await expect(abrirConRecuperacion(sobre, r.codigoDeRecuperacion)).resolves.toBeDefined()
  })
})

describe('volver a Estándar', () => {
  it('devuelve los movimientos y mueve el puntero de vuelta', async () => {
    const fake = supabaseFalso()
    const activada = await activarBoveda(fake.cliente, 'u1', 'x')
    if (!activada.ok) throw new Error('tenia que activar')

    const vuelta = await volverAEstandar(fake.cliente, 'u1', activada.claves)

    expect(vuelta.ok).toBe(true)
    expect(fake.backend()).toBe('SUPABASE')
    if (!vuelta.ok) return
    expect(vuelta.resumen.movimientos).toBe(2)
  })

  it('ida y vuelta no pierde ni inventa movimientos', async () => {
    const fake = supabaseFalso()
    const activada = await activarBoveda(fake.cliente, 'u1', 'x')
    if (!activada.ok) throw new Error('tenia que activar')

    const enBoveda = await todosLosMovimientos(
      await libroDelNavegador(fake.cliente, activada.claves)
    )
    await volverAEstandar(fake.cliente, 'u1', activada.claves)

    expect(enBoveda.map((m) => m.id).sort()).toEqual(['t1', 't2'])
    expect(fake.relacionales().transactions).toHaveLength(2)
  })
})
