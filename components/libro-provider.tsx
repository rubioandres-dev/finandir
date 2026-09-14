'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { libroDelNavegador } from '@/lib/almacen/acceso'
import { abrirConContrasena, abrirConRecuperacion, SecretoIncorrecto, type Claves } from '@/lib/almacen/cripto'
import type { Libro } from '@/lib/almacen/libro'
import { leerSobre } from '@/lib/almacen/nube'
import { bloquear, recordarClaves, recuperarClaves } from '@/lib/almacen/sesion'
import { createClient } from '@/lib/supabase/client'

/**
 * EL LIBRO DEL NAVEGADOR
 * =============================================================================
 *
 * En modo Bóveda el servidor no puede leer nada, así que el libro se arma acá,
 * con la clave que vive en este dispositivo. Este provider es el único lugar de
 * la app donde eso pasa.
 *
 * TRES ESTADOS Y NO DOS
 *
 *     'cargando'    todavía no sabemos si hay una sesión cifrada guardada
 *     'bloqueado'   hace falta la contraseña
 *     'abierto'     hay libro
 *
 * "Cargando" existe separado de "bloqueado" porque recuperar la clave de
 * IndexedDB es asíncrono: sin ese estado, la pantalla de desbloqueo parpadearía
 * en cada recarga para quien ya la tiene guardada.
 *
 * LA CONTRASEÑA NO SALE DE ACÁ
 *
 * Se usa para derivar la KEK y se descarta. No se guarda, no viaja al servidor y
 * no queda en ningún estado de React más allá del submit. Lo que sí se guarda
 * —cuando el usuario lo pide— es la CryptoKey ya derivada, en IndexedDB y sin
 * poder exportarse.
 */

type EstadoDelLibro =
  | { fase: 'cargando' }
  | { fase: 'bloqueado'; error: string | null }
  | { fase: 'abierto'; libro: Libro; claves: Claves }

type Contexto = EstadoDelLibro & {
  /** Devuelve `null` si salió bien, o el mensaje a mostrar si no. */
  desbloquear(secreto: string, tipo: 'contrasena' | 'recuperacion'): Promise<string | null>
  cerrar(): Promise<void>
}

const ContextoDelLibro = createContext<Contexto | null>(null)

export function ProveedorDeLibro({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<EstadoDelLibro>({ fase: 'cargando' })

  const abrirCon = useCallback(async (claves: Claves) => {
    const libro = await libroDelNavegador(createClient(), claves)
    setEstado({ fase: 'abierto', libro, claves })
  }, [])

  // Al montar: si hay una sesión cifrada guardada en este dispositivo, se entra
  // sin pedir nada. Si no, a la pantalla de desbloqueo.
  useEffect(() => {
    let vigente = true

    void (async () => {
      const guardadas = await recuperarClaves()
      if (!vigente) return

      if (!guardadas) {
        setEstado({ fase: 'bloqueado', error: null })
        return
      }

      try {
        await abrirCon(guardadas)
      } catch {
        // La clave guardada no sirve —el sobre cambió, o los bloques no se
        // pueden leer—. Se tira y se pide de nuevo, que es recuperable.
        await bloquear()
        if (vigente) setEstado({ fase: 'bloqueado', error: null })
      }
    })()

    return () => {
      vigente = false
    }
  }, [abrirCon])

  const desbloquear = useCallback<Contexto['desbloquear']>(
    async (secreto, tipo) => {
      const supabase = createClient()

      try {
        const sobre = await leerSobre(supabase)
        if (!sobre) return 'Esta cuenta no tiene el modo cifrado activado.'

        const claves =
          tipo === 'contrasena'
            ? await abrirConContrasena(sobre, secreto)
            : await abrirConRecuperacion(sobre, secreto)

        // Se recuerda ANTES de abrir el libro: si abrirlo falla por red, la
        // clave ya derivada no se pierde y el reintento no cuesta otros 600.000
        // ciclos de PBKDF2.
        await recordarClaves(claves)
        await abrirCon(claves)
        return null
      } catch (error) {
        if (error instanceof SecretoIncorrecto) {
          return tipo === 'contrasena'
            ? 'La contraseña no es correcta.'
            : 'El código de recuperación no es correcto.'
        }
        return error instanceof Error ? error.message : 'No se pudo desbloquear.'
      }
    },
    [abrirCon]
  )

  const cerrar = useCallback(async () => {
    await bloquear()
    setEstado({ fase: 'bloqueado', error: null })
  }, [])

  return (
    <ContextoDelLibro.Provider value={{ ...estado, desbloquear, cerrar }}>
      {children}
    </ContextoDelLibro.Provider>
  )
}

/**
 * El estado, o `null` si no hay provider arriba.
 *
 * En modo Estandar el provider NO se monta —no hay libro que armar—, asi que
 * cualquier componente que viva en el layout y quiera saber si hay boveda
 * tiene que poder preguntarlo sin explotar.
 */
export function useEstadoDelLibroOpcional(): Contexto | null {
  return useContext(ContextoDelLibro)
}

/** Todo el estado, incluidos "cargando" y "bloqueado". */
export function useEstadoDelLibro(): Contexto {
  const contexto = useContext(ContextoDelLibro)
  if (!contexto) {
    throw new Error('useEstadoDelLibro fuera de <ProveedorDeLibro>.')
  }
  return contexto
}

/**
 * El libro, ya abierto.
 *
 * Lanza si todavía no lo está. Es para los componentes que se montan DEBAJO del
 * guardián de desbloqueo y por lo tanto no pueden verse sin libro: preferimos
 * un error ruidoso en desarrollo a un `null` que se propague hasta una pantalla
 * en cero.
 */
export function useLibro(): Libro {
  const estado = useEstadoDelLibro()
  if (estado.fase !== 'abierto') {
    throw new Error('useLibro con el libro bloqueado: falta el guardián arriba.')
  }
  return estado.libro
}
