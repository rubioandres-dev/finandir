/**
 * Tests de las llaves de grupo.
 *
 * El que manda es el de expulsion: despues de rotar, el que se fue no tiene que
 * poder abrir NADA. Si eso falla, el modelo de compartidos cifrados no sirve.
 */

import { describe, expect, it } from 'vitest'
import { crearSobre } from './cripto'
import {
  abrirClaveDeGrupo,
  abrirParDeClaves,
  cifrarDelGrupo,
  crearClaveDeGrupo,
  crearParDeClaves,
  descifrarDelGrupo,
  envolverParaMiembro,
  importarPublica,
  rotarClaveDeGrupo,
} from './grupos'

const RAPIDO = 1_000

/** Un usuario con su sobre personal y su par de claves ya abierto. */
async function usuario(contrasena: string) {
  const { claves } = await crearSobre(contrasena, RAPIDO)
  const par = await crearParDeClaves(claves)
  return {
    claves,
    publica: par.publica,
    privadaEnvuelta: par.privadaEnvuelta,
    privada: await abrirParDeClaves(par.privadaEnvuelta, claves),
  }
}

describe('par de claves del usuario', () => {
  it('la privada se abre con la DEK propia', async () => {
    const ana = await usuario('ana')
    await expect(
      abrirParDeClaves(ana.privadaEnvuelta, ana.claves)
    ).resolves.toBeDefined()
  })

  it('la privada NO se abre con la DEK de otro', async () => {
    const ana = await usuario('ana')
    const beto = await usuario('beto')
    await expect(abrirParDeClaves(ana.privadaEnvuelta, beto.claves)).rejects.toThrow()
  })

  it('la publica no lleva la parte privada', async () => {
    const ana = await usuario('ana')
    // En un JWK de RSA, `d` es el exponente privado. Si aparece acá, estariamos
    // publicando la clave privada de todos.
    expect(ana.publica.d).toBeUndefined()
    expect(ana.publica.kty).toBe('RSA')
  })
})

describe('clave de grupo', () => {
  it('dos miembros distintos leen el mismo gasto', async () => {
    const ana = await usuario('ana')
    const beto = await usuario('beto')
    const gek = await crearClaveDeGrupo()

    const paraAna = await envolverParaMiembro(gek, await importarPublica(ana.publica), 1)
    const paraBeto = await envolverParaMiembro(gek, await importarPublica(beto.publica), 1)

    const gasto = await cifrarDelGrupo(gek, { monto: 12500, detalle: 'cena' })

    const gekAna = await abrirClaveDeGrupo(paraAna, ana.privada)
    const gekBeto = await abrirClaveDeGrupo(paraBeto, beto.privada)

    expect(await descifrarDelGrupo(gekAna, gasto)).toEqual({ monto: 12500, detalle: 'cena' })
    expect(await descifrarDelGrupo(gekBeto, gasto)).toEqual({ monto: 12500, detalle: 'cena' })
  })

  it('un ajeno al grupo no abre el sobre de un miembro', async () => {
    const ana = await usuario('ana')
    const intruso = await usuario('intruso')
    const gek = await crearClaveDeGrupo()
    const paraAna = await envolverParaMiembro(gek, await importarPublica(ana.publica), 1)

    await expect(abrirClaveDeGrupo(paraAna, intruso.privada)).rejects.toThrow()
  })

  it('el gasto cifrado no deja ver nada en claro', async () => {
    const gek = await crearClaveDeGrupo()
    const paquete = await cifrarDelGrupo(gek, { monto: 12500, detalle: 'cena en Dandy' })

    expect(paquete).not.toContain('12500')
    expect(paquete).not.toContain('Dandy')
    expect(paquete).not.toContain('monto')
  })
})

describe('expulsar a alguien', () => {
  it('el expulsado NO puede abrir la generacion nueva', async () => {
    const ana = await usuario('ana')
    const beto = await usuario('beto')
    const carla = await usuario('carla')

    // Generacion 1: los tres adentro.
    const gek1 = await crearClaveDeGrupo()
    const carlaG1 = await envolverParaMiembro(gek1, await importarPublica(carla.publica), 1)
    expect(await abrirClaveDeGrupo(carlaG1, carla.privada)).toBeDefined()

    // Se va Carla: se rota para los que quedan.
    const rotacion = await rotarClaveDeGrupo(1, [
      { memberId: 'ana', publica: ana.publica },
      { memberId: 'beto', publica: beto.publica },
    ])

    expect(rotacion.generacion).toBe(2)
    expect(rotacion.sobres.map((s) => s.memberId).sort()).toEqual(['ana', 'beto'])
    // No hay sobre para Carla: no hay nada que pueda abrir.
    expect(rotacion.sobres.find((s) => s.memberId === 'carla')).toBeUndefined()

    // Un gasto de la generacion 2 es ilegible para su clave vieja.
    const gastoNuevo = await cifrarDelGrupo(rotacion.gek, { monto: 999 })
    const gekViejaDeCarla = await abrirClaveDeGrupo(carlaG1, carla.privada)
    await expect(descifrarDelGrupo(gekViejaDeCarla, gastoNuevo)).rejects.toThrow()
  })

  it('los que quedan siguen leyendo despues de la rotacion', async () => {
    const ana = await usuario('ana')
    const rotacion = await rotarClaveDeGrupo(1, [
      { memberId: 'ana', publica: ana.publica },
    ])

    const gasto = await cifrarDelGrupo(rotacion.gek, { monto: 500 })
    const suGek = await abrirClaveDeGrupo(rotacion.sobres[0].sobre, ana.privada)

    expect(await descifrarDelGrupo(suGek, gasto)).toEqual({ monto: 500 })
  })

  it('la clave vieja SIGUE abriendo lo viejo hasta que se re-cifre', async () => {
    // No es un bug: es la razon por la que expulsar tiene que re-cifrar los
    // gastos existentes y no solo repartir una llave nueva.
    const carla = await usuario('carla')
    const gek1 = await crearClaveDeGrupo()
    const carlaG1 = await envolverParaMiembro(gek1, await importarPublica(carla.publica), 1)
    const gastoViejo = await cifrarDelGrupo(gek1, { monto: 300 })

    await rotarClaveDeGrupo(1, [])

    const suGek = await abrirClaveDeGrupo(carlaG1, carla.privada)
    expect(await descifrarDelGrupo(suGek, gastoViejo)).toEqual({ monto: 300 })
  })
})
