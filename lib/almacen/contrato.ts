/**
 * EL CONTRATO DE `Almacen`, ejecutable
 * =============================================================================
 *
 * Un backend de almacenamiento no se prueba leyendo su código: se prueba
 * pasándole los mismos tests que a todos los demás. Este archivo es esa suite.
 *
 *     probarContratoDeAlmacen('memoria', () => crearAlmacenEnMemoria())
 *     probarContratoDeAlmacen('nube', () => crearAlmacenNube(supabase))
 *
 * POR QUÉ IMPORTA MÁS DE LO QUE PARECE
 *
 * El lazo de reintentos de `Libro.mutar()` confía en que `guardar()` lanza
 * `ConflictoDeVersion` exactamente cuando debe. Un backend que devuelva éxito
 * en un caso donde el de al lado devuelve conflicto no rompe un test suyo:
 * rompe la garantía de que no se pierden datos, en producción y en silencio.
 * Estos tests existen para que esa diferencia aparezca antes.
 *
 * ES UN ARCHIVO DE TESTS aunque no se llame `.test.ts`: importa `vitest` y lo
 * único que hace es declarar casos. No lo importe nada de `app/`.
 */

import { describe, expect, it } from 'vitest'
import { ConflictoDeVersion, type Almacen } from './tipos'

const codificador = new TextEncoder()
const decodificador = new TextDecoder()

export type FabricaDeAlmacen = () => Almacen | Promise<Almacen>

export function probarContratoDeAlmacen(nombre: string, crear: FabricaDeAlmacen) {
  describe(`contrato de Almacen: ${nombre}`, () => {
    it('una clave que no existe devuelve null, no lanza', async () => {
      const almacen = await crear()
      expect(await almacen.obtener('no-existe')).toBeNull()
    })

    it('guardar con versionEsperada null crea el bloque', async () => {
      const almacen = await crear()
      const guardado = await almacen.guardar('a', codificador.encode('uno'), null)

      expect(guardado.version).toBeTruthy()
      const leido = await almacen.obtener('a')
      expect(decodificador.decode(leido!.contenido)).toBe('uno')
    })

    it('crear sobre algo que ya existe es un conflicto', async () => {
      const almacen = await crear()
      await almacen.guardar('a', codificador.encode('uno'), null)

      await expect(
        almacen.guardar('a', codificador.encode('dos'), null)
      ).rejects.toThrow(ConflictoDeVersion)
    })

    it('guardar con la versión correcta actualiza y devuelve otra versión', async () => {
      const almacen = await crear()
      const primera = await almacen.guardar('a', codificador.encode('uno'), null)
      const segunda = await almacen.guardar(
        'a',
        codificador.encode('dos'),
        primera.version
      )

      expect(segunda.version).not.toBe(primera.version)
      const leido = await almacen.obtener('a')
      expect(decodificador.decode(leido!.contenido)).toBe('dos')
    })

    it('guardar con una versión vieja es un conflicto y NO pisa', async () => {
      const almacen = await crear()
      const primera = await almacen.guardar('a', codificador.encode('uno'), null)
      await almacen.guardar('a', codificador.encode('dos'), primera.version)

      await expect(
        almacen.guardar('a', codificador.encode('tres'), primera.version)
      ).rejects.toThrow(ConflictoDeVersion)

      const leido = await almacen.obtener('a')
      expect(decodificador.decode(leido!.contenido)).toBe('dos')
    })

    it('el contenido vuelve byte por byte, no como texto', async () => {
      // El ciphertext tiene bytes arbitrarios: 0x00, 0xFF y secuencias que no
      // son UTF-8 válido. Un backend que pase el contenido por un decoder de
      // texto en algún punto del camino rompe acá y sólo acá.
      const almacen = await crear()
      const bytes = new Uint8Array([0, 1, 127, 128, 200, 255, 0, 254])

      await almacen.guardar('binario', bytes, null)
      const leido = await almacen.obtener('binario')

      expect([...leido!.contenido]).toEqual([...bytes])
    })

    it('borrar con la versión correcta borra', async () => {
      const almacen = await crear()
      const guardado = await almacen.guardar('a', codificador.encode('uno'), null)

      await almacen.borrar('a', guardado.version)
      expect(await almacen.obtener('a')).toBeNull()
    })

    it('borrar con una versión que no coincide es un conflicto', async () => {
      const almacen = await crear()
      const primera = await almacen.guardar('a', codificador.encode('uno'), null)
      await almacen.guardar('a', codificador.encode('dos'), primera.version)

      await expect(almacen.borrar('a', primera.version)).rejects.toThrow(
        ConflictoDeVersion
      )
      expect(await almacen.obtener('a')).not.toBeNull()
    })

    it('listar informa cada bloque con su tamaño almacenado', async () => {
      const almacen = await crear()
      await almacen.guardar('a', codificador.encode('uno'), null)
      await almacen.guardar('b', codificador.encode('dos mil y un poco mas'), null)

      const lista = await almacen.listar()
      const porClave = Object.fromEntries(lista.map((r) => [r.clave, r]))

      expect(Object.keys(porClave).sort()).toEqual(['a', 'b'])

      // NO se compara contra el largo del texto: un almacen cifrado guarda
      // ademas el IV y el tag de GCM, y su `bytes` es legitimamente mayor.
      // Lo que si vale para todos es que sea positivo y que respete el orden.
      expect(porClave.a.bytes).toBeGreaterThan(0)
      expect(porClave.b.bytes).toBeGreaterThan(porClave.a.bytes)
    })
  })
}
