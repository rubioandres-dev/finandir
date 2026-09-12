/**
 * Tests del modelo de claves C3 y del envoltorio de cifrado.
 *
 * Casi todos usan pocas iteraciones de PBKDF2 para que la suite corra rápido;
 * hay uno solo con las 600.000 reales para que el camino por defecto también
 * quede probado.
 */

import { describe, expect, it } from 'vitest'
import {
  abrirConContrasena,
  abrirConRecuperacion,
  crearAlmacenCifrado,
  crearSobre,
  generarCodigoDeRecuperacion,
  normalizarCodigo,
  rotarContrasena,
  rotarRecuperacion,
  SecretoIncorrecto,
} from './cripto'
import { crearLibro } from './libro'
import { crearAlmacenEnMemoria } from './memoria'
import type { CuentaGuardada } from './documentos'

/** Suficiente para probar la mecánica; nadie mide seguridad con esto. */
const RAPIDO = 1_000

const codificador = new TextEncoder()
const decodificador = new TextDecoder()

/** Prueba que dos juegos de claves son el mismo: uno cifra, el otro abre. */
async function mismaDek(
  a: { dek: CryptoKey },
  b: { dek: CryptoKey }
): Promise<boolean> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    a.dek,
    codificador.encode('secreto')
  )
  try {
    const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, b.dek, cifrado)
    return decodificador.decode(plano) === 'secreto'
  } catch {
    return false
  }
}

// --- El sobre ----------------------------------------------------------------

describe('sobre de claves', () => {
  it('la contraseña vuelve a abrir la misma DEK', async () => {
    const { sobre, claves } = await crearSobre('correcta', RAPIDO)
    const reabierta = await abrirConContrasena(sobre, 'correcta')
    expect(await mismaDek(claves, reabierta)).toBe(true)
  })

  it('una contraseña equivocada no abre', async () => {
    const { sobre } = await crearSobre('correcta', RAPIDO)
    await expect(abrirConContrasena(sobre, 'equivocada')).rejects.toThrow(
      SecretoIncorrecto
    )
  })

  it('el código de recuperación abre la misma DEK', async () => {
    const { sobre, claves, codigoDeRecuperacion } = await crearSobre('x', RAPIDO)
    const reabierta = await abrirConRecuperacion(sobre, codigoDeRecuperacion)
    expect(await mismaDek(claves, reabierta)).toBe(true)
  })

  it('el código se tipea como salga: minúsculas, sin guiones, con espacios', async () => {
    const { sobre, claves, codigoDeRecuperacion } = await crearSobre('x', RAPIDO)
    const desprolijo = ` ${codigoDeRecuperacion.toLowerCase().replace(/-/g, ' ')} `
    const reabierta = await abrirConRecuperacion(sobre, desprolijo)
    expect(await mismaDek(claves, reabierta)).toBe(true)
  })

  it('el sobre no contiene nada legible de la DEK', async () => {
    const { sobre } = await crearSobre('x', RAPIDO)
    const texto = JSON.stringify(sobre)
    // Lo que sí tiene que estar: los parámetros para rehacer la KEK.
    expect(sobre.porContrasena.iteraciones).toBe(RAPIDO)
    expect(sobre.porContrasena.sal).not.toEqual(sobre.porRecuperacion.sal)
    // Y las dos envolturas son distintas aunque envuelvan la misma clave.
    expect(sobre.porContrasena.paquete).not.toEqual(sobre.porRecuperacion.paquete)
    expect(texto).not.toContain('dek')
  })

  it('funciona con las iteraciones reales', async () => {
    const { sobre, claves } = await crearSobre('produccion')
    expect(sobre.porContrasena.iteraciones).toBe(600_000)
    const reabierta = await abrirConContrasena(sobre, 'produccion')
    expect(await mismaDek(claves, reabierta)).toBe(true)
  })
})

describe('código de recuperación', () => {
  it('sale en cuatro grupos de cinco, sin caracteres ambiguos', () => {
    const codigo = generarCodigoDeRecuperacion()
    expect(codigo).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/)
    expect(normalizarCodigo(codigo)).toHaveLength(20)
    // I, L, O y U se confunden con 1, 0 y V al copiarlas a mano.
    expect(codigo).not.toMatch(/[ILOU]/)
  })

  it('no se repite', () => {
    const codigos = new Set(Array.from({ length: 50 }, generarCodigoDeRecuperacion))
    expect(codigos.size).toBe(50)
  })
})

// --- Rotación: lo que justifica el modelo de dos claves ----------------------

describe('cambio de contraseña', () => {
  it('la nueva abre, la vieja no, y los datos no se tocan', async () => {
    const { sobre, claves } = await crearSobre('vieja', RAPIDO)
    const rotado = await rotarContrasena(sobre, 'vieja', 'nueva')

    expect(await mismaDek(claves, await abrirConContrasena(rotado, 'nueva'))).toBe(true)
    await expect(abrirConContrasena(rotado, 'vieja')).rejects.toThrow(SecretoIncorrecto)
  })

  it('EL CÓDIGO DE RECUPERACIÓN SIGUE SIRVIENDO', async () => {
    // Este es el test que justifica la sal por envoltura. Con una sal
    // compartida, rotar la contraseña dejaba la envoltura de recuperación
    // imposible de abrir con nada.
    const { sobre, claves, codigoDeRecuperacion } = await crearSobre('vieja', RAPIDO)
    const rotado = await rotarContrasena(sobre, 'vieja', 'nueva')

    expect(rotado.porRecuperacion).toEqual(sobre.porRecuperacion)
    const reabierta = await abrirConRecuperacion(rotado, codigoDeRecuperacion)
    expect(await mismaDek(claves, reabierta)).toBe(true)
  })

  it('cambia la sal para invalidar el trabajo previo de un atacante', async () => {
    const { sobre } = await crearSobre('vieja', RAPIDO)
    const rotado = await rotarContrasena(sobre, 'vieja', 'nueva')
    expect(rotado.porContrasena.sal).not.toEqual(sobre.porContrasena.sal)
  })

  it('con la contraseña vieja equivocada no rota', async () => {
    const { sobre } = await crearSobre('vieja', RAPIDO)
    await expect(rotarContrasena(sobre, 'cualquiera', 'nueva')).rejects.toThrow(
      SecretoIncorrecto
    )
  })
})

describe('emisión de un código nuevo', () => {
  it('el nuevo abre, el viejo deja de abrir, la contraseña sigue igual', async () => {
    const { sobre, claves, codigoDeRecuperacion: viejo } = await crearSobre('p', RAPIDO)
    const { sobre: rotado, codigoDeRecuperacion: nuevo } = await rotarRecuperacion(
      sobre,
      'p'
    )

    expect(await mismaDek(claves, await abrirConRecuperacion(rotado, nuevo))).toBe(true)
    await expect(abrirConRecuperacion(rotado, viejo)).rejects.toThrow(SecretoIncorrecto)
    expect(rotado.porContrasena).toEqual(sobre.porContrasena)
  })
})

// --- El envoltorio de almacén ------------------------------------------------

describe('almacén cifrado', () => {
  it('ida y vuelta: lo que entra en claro sale en claro', async () => {
    const { claves } = await crearSobre('x', RAPIDO)
    const almacen = crearAlmacenCifrado(crearAlmacenEnMemoria(), claves)

    await almacen.guardar('cuentas', codificador.encode('{"hola":1}'), null)
    const leido = await almacen.obtener('cuentas')

    expect(decodificador.decode(leido!.contenido)).toBe('{"hola":1}')
  })

  it('el almacén de abajo NO ve texto plano', async () => {
    const { claves } = await crearSobre('x', RAPIDO)
    const adentro = crearAlmacenEnMemoria()
    const almacen = crearAlmacenCifrado(adentro, claves)

    await almacen.guardar('cuentas', codificador.encode('{"name":"Banco Galicia"}'), null)

    const crudo = await adentro.obtener('cuentas')
    const comoTexto = decodificador.decode(crudo!.contenido)
    expect(comoTexto).not.toContain('Banco')
    expect(comoTexto).not.toContain('name')
    // Byte 0 = versión de formato, después 12 de IV.
    expect(crudo!.contenido[0]).toBe(1)
  })

  it('dos escrituras del mismo contenido dan bytes distintos (IV nuevo)', async () => {
    const { claves } = await crearSobre('x', RAPIDO)
    const adentro = crearAlmacenEnMemoria()
    const almacen = crearAlmacenCifrado(adentro, claves)
    const contenido = codificador.encode('mismo')

    await almacen.guardar('a', contenido, null)
    const primera = (await adentro.obtener('a'))!.contenido.slice()
    const version = (await adentro.obtener('a'))!.version
    await almacen.guardar('a', contenido, version)
    const segunda = (await adentro.obtener('a'))!.contenido

    expect([...primera]).not.toEqual([...segunda])
  })

  it('un bloque alterado no se abre: GCM autentica, no sólo cifra', async () => {
    const { claves } = await crearSobre('x', RAPIDO)
    const adentro = crearAlmacenEnMemoria()
    const almacen = crearAlmacenCifrado(adentro, claves)

    await almacen.guardar('a', codificador.encode('importe: 100'), null)

    // El servidor cambia un bit del ciphertext.
    const crudo = (await adentro.obtener('a'))!
    const alterado = crudo.contenido.slice()
    alterado[alterado.length - 1] ^= 0x01
    adentro.sembrarCrudo('a', alterado)

    await expect(almacen.obtener('a')).rejects.toThrow(SecretoIncorrecto)
  })

  it('otra DEK no abre lo que cifró la primera', async () => {
    const adentro = crearAlmacenEnMemoria()
    const { claves: unas } = await crearSobre('x', RAPIDO)
    const { claves: otras } = await crearSobre('y', RAPIDO)

    await crearAlmacenCifrado(adentro, unas).guardar('a', codificador.encode('hola'), null)

    await expect(crearAlmacenCifrado(adentro, otras).obtener('a')).rejects.toThrow(
      SecretoIncorrecto
    )
  })
})

// --- Integración: el Libro sobre un almacén cifrado --------------------------

describe('el libro sobre cifrado', () => {
  it('el lazo de conflictos sigue funcionando a través del cifrado', async () => {
    const { claves } = await crearSobre('x', RAPIDO)

    let inyectado = false
    const adentro = crearAlmacenEnMemoria({
      antesDeGuardar: async () => {
        if (inyectado) return
        inyectado = true
        // El otro dispositivo escribe: pasa por el cifrado igual que nosotros.
        await crearAlmacenCifrado(adentro, claves).guardar(
          'cuentas',
          codificador.encode(JSON.stringify([{ id: 'laptop' }])),
          null
        )
      },
    })

    const libro = crearLibro(crearAlmacenCifrado(adentro, claves))
    await libro.mutar('cuentas', (c) => [
      ...c,
      { id: 'telefono' } as unknown as CuentaGuardada,
    ])

    const final = await libro.leer('cuentas')
    expect(final.map((c) => c.id).sort()).toEqual(['laptop', 'telefono'])
    // Y en disco no hay nada legible.
    const crudo = await adentro.obtener('cuentas')
    expect(decodificador.decode(crudo!.contenido)).not.toContain('telefono')
  })
})
