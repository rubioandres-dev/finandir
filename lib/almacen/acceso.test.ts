/**
 * El test que importa es el de la negativa.
 *
 * Si `libroDelServidor` devolviera un libro vacio para una cuenta en Boveda, el
 * dashboard se renderizaria en cero y el usuario veria sus finanzas como si no
 * tuviera nada. Eso es peor que un error: PARECE un dato.
 */

import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { backendDelUsuario, libroDelServidor, ModoCifradoEnServidor } from './acceso'

/** Supabase de mentira: solo la consulta del backend. */
function supabaseCon(storage_backend: string | null, error: unknown = null) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: error ? null : { storage_backend }, error }
                },
              }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
}

describe('backend del usuario', () => {
  it('lee el modo que tiene guardado', async () => {
    expect(await backendDelUsuario(supabaseCon('NUBE'), 'u1')).toBe('NUBE')
    expect(await backendDelUsuario(supabaseCon('DRIVE'), 'u1')).toBe('DRIVE')
  })

  it('sin la 018 corrida, todos son SUPABASE', async () => {
    // La columna no existe: es exactamente lo que eran antes de que el modo
    // existiera, asi que no hay nada que avisar.
    expect(await backendDelUsuario(supabaseCon(null, { code: '42703' }), 'u1')).toBe('SUPABASE')
  })

  it('sin fila de perfil tambien es SUPABASE', async () => {
    expect(await backendDelUsuario(supabaseCon(null), 'u1')).toBe('SUPABASE')
  })
})

describe('libro del servidor', () => {
  it('en modo Estandar devuelve el libro relacional', async () => {
    const libro = await libroDelServidor(supabaseCon('SUPABASE'), 'u1')
    expect(libro.tipo).toBe('relacional')
  })

  it('EN BOVEDA SE NIEGA, en vez de devolver un libro vacio', async () => {
    await expect(libroDelServidor(supabaseCon('NUBE'), 'u1')).rejects.toThrow(
      ModoCifradoEnServidor
    )
  })

  it('en Drive tambien se niega', async () => {
    await expect(libroDelServidor(supabaseCon('DRIVE'), 'u1')).rejects.toThrow(
      ModoCifradoEnServidor
    )
  })

  it('el error dice cual es el modo, para que la pagina sepa que hacer', async () => {
    try {
      await libroDelServidor(supabaseCon('NUBE'), 'u1')
      expect.unreachable('tenia que lanzar')
    } catch (error) {
      expect(error).toBeInstanceOf(ModoCifradoEnServidor)
      expect((error as ModoCifradoEnServidor).backend).toBe('NUBE')
    }
  })

  it('el backend se consulta UNA vez por request', async () => {
    let consultas = 0
    const cliente = {
      from() {
        consultas += 1
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { storage_backend: 'SUPABASE' }, error: null }) }),
          }),
        }
      },
    } as unknown as SupabaseClient

    await libroDelServidor(cliente, 'u1')
    await libroDelServidor(cliente, 'u1')
    await libroDelServidor(cliente, 'u1')

    // Sin el memo, una pagina con tres services pagaria tres consultas
    // identicas para preguntar lo mismo.
    expect(consultas).toBe(1)
  })

  it('el libro tambien se reusa dentro del request', async () => {
    const cliente = supabaseCon('SUPABASE')
    const a = await libroDelServidor(cliente, 'u1')
    const b = await libroDelServidor(cliente, 'u1')
    // Misma instancia: comparten el memo de cuentas, asi que la tabla se lee
    // una vez y no una por service.
    expect(a).toBe(b)
  })
})
