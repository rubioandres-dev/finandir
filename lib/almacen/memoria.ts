/**
 * ALMACÉN EN MEMORIA — el banco de pruebas
 * =============================================================================
 *
 * Implementa `Almacen` sobre un `Map`. Existe por dos razones:
 *
 * 1. TESTEAR EL LAZO DE CONFLICTOS SIN BACKEND. El reintento optimista de
 *    `Libro.mutar()` es el único lugar del diseño donde se pueden perder datos.
 *    Probarlo contra Drive exigiría OAuth, red y dos dispositivos de verdad;
 *    acá se provoca la carrera a voluntad y es determinista.
 *
 * 2. CORRER LA APP SIN PERSISTENCIA. Útil para el demo (`app/demo/page.tsx`) y
 *    para desarrollar pantallas sin tocar datos reales.
 *
 * EL GANCHO `antesDeGuardar` ES LA PIEZA CLAVE
 *
 * Se dispara justo antes de cada escritura, que es la ventana exacta donde otro
 * dispositivo puede meterse. Un test que ahí adentro llama a `sembrar()` está
 * reproduciendo, con precisión y sin esperar a nadie, lo que pasa cuando el
 * teléfono y la laptop guardan al mismo tiempo.
 */

import {
  ConflictoDeVersion,
  type Almacen,
  type Bloque,
  type Clave,
  type ResumenDeBloque,
  type Version,
  type VersionEsperada,
} from './tipos'

export type OpcionesDeMemoria = {
  /**
   * Corre antes de cada intento de escritura, incluidos los reintentos.
   * `intento` arranca en 1. Sembrar acá provoca el conflicto.
   */
  antesDeGuardar?: (clave: Clave, intento: number) => void | Promise<void>
}

export type AlmacenEnMemoria = Almacen & {
  /**
   * Escribe salteando el control de versión: simula a OTRO dispositivo que ya
   * guardó. No es parte de `Almacen` — ningún backend real expone esto.
   */
  sembrar(clave: Clave, valor: unknown): void

  /**
   * Escribe bytes crudos, sin serializar ni versionar. Simula a un servidor
   * que altera el contenido: es como se prueba que GCM autentica ademas de
   * cifrar.
   */
  sembrarCrudo(clave: Clave, contenido: Uint8Array<ArrayBuffer>): void

  /** Lee sin pasar por el libro. Para aserciones sobre el estado final. */
  espiar<T>(clave: Clave): T | null

  /** Llamadas acumuladas. Sirve para verificar que el caché evita viajes. */
  readonly llamadas: { obtener: number; guardar: number; borrar: number }
}

const codificador = new TextEncoder()
const decodificador = new TextDecoder()

export function crearAlmacenEnMemoria(
  opciones: OpcionesDeMemoria = {}
): AlmacenEnMemoria {
  const bloques = new Map<Clave, { contenido: Uint8Array<ArrayBuffer>; version: Version }>()
  const llamadas = { obtener: 0, guardar: 0, borrar: 0 }
  const intentosPorClave = new Map<Clave, number>()
  let contador = 0

  const siguienteVersion = (): Version => `v${++contador}`

  return {
    tipo: 'memoria',
    llamadas,

    async obtener(clave) {
      llamadas.obtener++
      const bloque = bloques.get(clave)
      if (!bloque) return null
      return { clave, contenido: bloque.contenido, version: bloque.version }
    },

    async guardar(clave, contenido, versionEsperada: VersionEsperada) {
      llamadas.guardar++

      const intento = (intentosPorClave.get(clave) ?? 0) + 1
      intentosPorClave.set(clave, intento)
      await opciones.antesDeGuardar?.(clave, intento)

      const actual = bloques.get(clave)

      // `null` significa "creá esto": si ya existe, alguien se adelantó.
      if (versionEsperada === null && actual) {
        throw new ConflictoDeVersion(clave, {
          clave,
          contenido: actual.contenido,
          version: actual.version,
        })
      }

      if (versionEsperada !== null) {
        if (!actual) throw new ConflictoDeVersion(clave, null)
        if (actual.version !== versionEsperada) {
          throw new ConflictoDeVersion(clave, {
            clave,
            contenido: actual.contenido,
            version: actual.version,
          })
        }
      }

      const version = siguienteVersion()
      bloques.set(clave, { contenido, version })
      return { clave, contenido, version } satisfies Bloque
    },

    async borrar(clave, versionEsperada) {
      llamadas.borrar++
      const actual = bloques.get(clave)
      if (!actual || actual.version !== versionEsperada) {
        throw new ConflictoDeVersion(clave, null)
      }
      bloques.delete(clave)
    },

    async listar() {
      return [...bloques.entries()].map(
        ([clave, b]): ResumenDeBloque => ({
          clave,
          version: b.version,
          bytes: b.contenido.byteLength,
          modificado: null,
        })
      )
    },

    sembrar(clave, valor) {
      bloques.set(clave, {
        contenido: codificador.encode(JSON.stringify(valor)),
        version: siguienteVersion(),
      })
    },

    sembrarCrudo(clave, contenido) {
      bloques.set(clave, { contenido, version: siguienteVersion() })
    },

    espiar(clave) {
      const bloque = bloques.get(clave)
      if (!bloque) return null
      return JSON.parse(decodificador.decode(bloque.contenido))
    },
  }
}
