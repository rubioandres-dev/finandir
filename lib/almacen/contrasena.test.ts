/**
 * Tests del cambio de contraseña en modo cifrado.
 *
 * Lo que importa acá no es el camino feliz: es que NINGUNA falla deje al usuario
 * con la contraseña de acceso y la de sus datos apuntando a cosas distintas.
 * Cada test termina preguntando qué abre el sobre que quedó guardado.
 */

import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cambiarContrasena } from './contrasena'
import {
  abrirConContrasena,
  abrirConRecuperacion,
  crearSobre,
  SecretoIncorrecto,
  type SobreDeClaves,
} from './cripto'

const RAPIDO = 1_000

type Fallas = {
  /** Hace fallar el guardado del sobre; `2` falla recién en el rollback. */
  fallarGuardadoEn?: number
  fallarAuth?: string
}

/**
 * Supabase de mentira: sólo lo que toca `cambiarContrasena`. Un fake de tres
 * métodos alcanza y se lee entero, que es más de lo que se puede decir de un
 * mock de la librería.
 */
function supabaseFalso(sobreInicial: SobreDeClaves, fallas: Fallas = {}) {
  let guardado = sobreInicial
  let guardados = 0
  let contrasenaDeAuth = 'vieja'

  const cliente = {
    from() {
      return {
        select() {
          return {
            async maybeSingle() {
              return { data: { sobre: guardado }, error: null }
            },
          }
        },
        async upsert(fila: { sobre: SobreDeClaves }) {
          guardados += 1
          if (fallas.fallarGuardadoEn === guardados) {
            return { error: { message: 'se cayó la base', code: 'XX000' } }
          }
          guardado = fila.sobre
          return { error: null }
        },
      }
    },
    auth: {
      async updateUser({ password }: { password: string }) {
        if (fallas.fallarAuth) return { error: { message: fallas.fallarAuth } }
        contrasenaDeAuth = password
        return { error: null }
      },
    },
  }

  return {
    cliente: cliente as unknown as SupabaseClient,
    sobreGuardado: () => guardado,
    contrasenaDeAuth: () => contrasenaDeAuth,
  }
}

describe('cambiar la contraseña', () => {
  it('camino feliz: Auth y el sobre quedan en la nueva', async () => {
    const { sobre } = await crearSobre('vieja', RAPIDO)
    const fake = supabaseFalso(sobre)

    const r = await cambiarContrasena(fake.cliente, 'u1', 'vieja', 'nueva')

    expect(r.ok).toBe(true)
    expect(fake.contrasenaDeAuth()).toBe('nueva')
    await expect(
      abrirConContrasena(fake.sobreGuardado(), 'nueva')
    ).resolves.toBeDefined()
    await expect(abrirConContrasena(fake.sobreGuardado(), 'vieja')).rejects.toThrow(
      SecretoIncorrecto
    )
  })

  it('con la contraseña vieja equivocada no toca nada', async () => {
    const { sobre } = await crearSobre('vieja', RAPIDO)
    const fake = supabaseFalso(sobre)

    const r = await cambiarContrasena(fake.cliente, 'u1', 'cualquiera', 'nueva')

    expect(r).toMatchObject({ ok: false, estado: 'sin-cambios' })
    expect(fake.contrasenaDeAuth()).toBe('vieja')
    expect(fake.sobreGuardado()).toEqual(sobre)
  })

  it('si Auth falla, el sobre vuelve al anterior', async () => {
    const { sobre } = await crearSobre('vieja', RAPIDO)
    const fake = supabaseFalso(sobre, { fallarAuth: 'la sesión venció' })

    const r = await cambiarContrasena(fake.cliente, 'u1', 'vieja', 'nueva')

    expect(r).toMatchObject({ ok: false, estado: 'revertido' })
    expect(fake.contrasenaDeAuth()).toBe('vieja')
    // Y lo que de verdad importa: la vieja sigue abriendo lo que quedó guardado.
    await expect(
      abrirConContrasena(fake.sobreGuardado(), 'vieja')
    ).resolves.toBeDefined()
  })

  it('si el guardado del sobre falla, Auth ni se intenta', async () => {
    const { sobre } = await crearSobre('vieja', RAPIDO)
    const fake = supabaseFalso(sobre, { fallarGuardadoEn: 1 })

    const r = await cambiarContrasena(fake.cliente, 'u1', 'vieja', 'nueva')

    expect(r).toMatchObject({ ok: false, estado: 'sin-cambios' })
    expect(fake.contrasenaDeAuth()).toBe('vieja')
  })

  it('si Auth falla Y el rollback falla, avisa que use el código', async () => {
    const { sobre } = await crearSobre('vieja', RAPIDO)
    // El segundo guardado es el del rollback.
    const fake = supabaseFalso(sobre, {
      fallarAuth: 'la sesión venció',
      fallarGuardadoEn: 2,
    })

    const r = await cambiarContrasena(fake.cliente, 'u1', 'vieja', 'nueva')

    expect(r).toMatchObject({ ok: false, estado: 'desincronizado' })
    expect(r.ok === false && r.error).toContain('código de recuperación')
    expect(r.ok === false && r.error).toContain('NO se perdieron')
  })

  it('el código de recuperación sobrevive a cualquier cambio de contraseña', async () => {
    // Es la red que hace tolerable todo lo anterior: pase lo que pase con la
    // contraseña, el código anotado en papel sigue abriendo los datos.
    const { sobre, codigoDeRecuperacion } = await crearSobre('vieja', RAPIDO)
    const fake = supabaseFalso(sobre)

    await cambiarContrasena(fake.cliente, 'u1', 'vieja', 'nueva')

    await expect(
      abrirConRecuperacion(fake.sobreGuardado(), codigoDeRecuperacion)
    ).resolves.toBeDefined()
  })
})
