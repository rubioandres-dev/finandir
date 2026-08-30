'use client'

import { useSyncExternalStore } from 'react'
import type { ComprobanteParseado } from '@/app/api/ai/parse-document/route'
import type { Clave, Traductor } from '@/lib/i18n'

/**
 * EL ANÁLISIS DE UN COMPROBANTE NO ES DEL MODAL, ES DE LA APP
 *
 * Antes el `fetch` a `/api/ai/parse-document` vivía en un efecto del
 * `<DocumentScannerModal>`. Cerrarlo —un toque afuera, un Escape, un toque de
 * más— lo desmontaba, y con el desmontaje se perdía una lectura que ya estaba
 * paga: la foto se subió igual y el modelo la procesó igual, pero el usuario
 * se queda sin nada y con la sensación de que la app le canceló la carga.
 *
 * Por eso el análisis vive acá, en un store de módulo, y NO en el componente:
 * un módulo no se desmonta. El modal pasa a ser una vista de este estado, y
 * cerrarlo es MINIMIZAR, no cancelar. Descartar existe, pero es explícito.
 *
 * Es el mismo patrón de `url-action-handler.tsx`, y por el mismo motivo: el
 * padre de todo esto es un server component, así que no hay estado de React
 * que se pueda compartir sin envolver medio layout en un provider.
 */

/** Un error de lectura: clave traducible, o texto que ya vino del servidor. */
export type FallaDeEscaneo = { clave: Clave } | { texto: string }

export type Escaneo = {
  /** Distingue dos escaneos seguidos; una respuesta vieja no pisa a la nueva. */
  id: number
  archivo: File
  fase: 'analizando' | 'listo' | 'error'
  datos: ComprobanteParseado | null
  falla: FallaDeEscaneo | null
  /** ¿El modal está en pantalla, o quedó trabajando en segundo plano? */
  enPantalla: boolean
}

let escaneo: Escaneo | null = null
let secuencia = 0
let abortador: AbortController | null = null

/**
 * Se avisó por notificación con la app en segundo plano y el usuario todavía
 * no volvió. Cuando vuelva, el modal se abre solo (`retomarAlVolver`).
 */
let avisoPendiente = false

const escuchas = new Set<() => void>()

function publicar(siguiente: Escaneo | null) {
  escaneo = siguiente
  escuchas.forEach((avisar) => avisar())
}

/** Aplica cambios solo si el escaneo sigue siendo el mismo. */
function actualizar(id: number, cambios: Partial<Escaneo>) {
  if (!escaneo || escaneo.id !== id) return
  publicar({ ...escaneo, ...cambios })
}

/**
 * Arranca la lectura de un comprobante y abre el modal.
 *
 * `t` se recibe y se retiene hasta que termina porque el texto de la
 * notificación se arma acá, fuera de React, donde no hay hooks. Un escaneo
 * dura segundos: que quede atado al idioma que había al empezar no molesta.
 */
export function iniciarEscaneo(archivo: File, categorias: string[], t: Traductor) {
  // Elegir un segundo archivo reemplaza al primero: uno por vez.
  descartarEscaneo()

  secuencia += 1
  const id = secuencia
  const controlador = new AbortController()
  abortador = controlador

  publicar({ id, archivo, fase: 'analizando', datos: null, falla: null, enPantalla: true })

  void analizar(id, archivo, categorias, controlador.signal, t)
}

async function analizar(
  id: number,
  archivo: File,
  categorias: string[],
  signal: AbortSignal,
  t: Traductor
) {
  const cuerpo = new FormData()
  cuerpo.append('file', archivo)
  cuerpo.append('categories', categorias.join('\n'))

  try {
    const respuesta = await fetch('/api/ai/parse-document', {
      method: 'POST',
      body: cuerpo,
      signal,
    })
    const datos = await respuesta.json()

    if (signal.aborted) return

    if (!respuesta.ok) {
      terminar(
        id,
        {
          fase: 'error',
          falla:
            typeof datos?.error === 'string'
              ? { texto: datos.error }
              : { clave: 'escaner.errorLectura' },
        },
        t
      )
    } else {
      terminar(id, { fase: 'listo', datos: datos as ComprobanteParseado }, t)
    }
  } catch {
    // `abort()` también cae acá: el descarte ya limpió el estado.
    if (signal.aborted) return
    terminar(id, { fase: 'error', falla: { clave: 'escaner.errorConexion' } }, t)
  }
}

/**
 * Cierra la lectura y decide quién se entera.
 *
 * Con la app a la vista el modal vuelve solo, esté minimizado o no: es
 * exactamente lo que el usuario estaba esperando. Con la app en segundo plano
 * no se le puede robar la pantalla, así que se avisa por notificación y el
 * modal se reabre cuando vuelva.
 */
function terminar(id: number, cambios: Partial<Escaneo>, t: Traductor) {
  if (!escaneo || escaneo.id !== id) return

  const aLaVista = typeof document !== 'undefined' && document.visibilityState === 'visible'

  actualizar(id, { ...cambios, enPantalla: aLaVista ? true : escaneo.enPantalla })

  if (aLaVista) return

  avisoPendiente = true

  void notificar(
    cambios.fase === 'error' ? t('escaner.avisoErrorTitulo') : t('escaner.avisoListoTitulo'),
    cambios.fase === 'error' ? t('escaner.avisoErrorCuerpo') : t('escaner.avisoListoCuerpo')
  )
}

/**
 * Muestra el aviso del sistema.
 *
 * Vía el service worker y no con `new Notification(...)`: Chrome en Android
 * NO soporta el constructor —tira `TypeError: Illegal constructor`— y es
 * justo el caso que importa, la PWA instalada en el celular. El constructor
 * queda de reserva para escritorio sin service worker registrado.
 */
async function notificar(titulo: string, cuerpo: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  const opciones = {
    body: cuerpo,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Un solo aviso a la vez: si ya había uno, este lo reemplaza.
    tag: 'aurem-comprobante',
    data: { url: '/dashboard' },
  }

  try {
    const registro = await navigator.serviceWorker?.getRegistration()

    if (registro) await registro.showNotification(titulo, opciones)
    else new Notification(titulo, opciones)
  } catch {
    // Un aviso que no se pudo mostrar no es motivo para romper el escaneo: el
    // comprobante sigue leído y el modal se abre igual al volver a la app.
  }
}

/**
 * Pide el permiso de notificaciones, si todavía no se decidió.
 *
 * Se llama al minimizar y no al abrir la cámara a propósito: recién ahí el
 * aviso sirve de algo, y el usuario acaba de leer el cartel que le explica
 * que la lectura sigue sola. Además el toque que cerró el modal es la
 * activación de usuario que Safari exige para mostrar el prompt.
 */
export async function pedirPermisoDeAviso() {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'default') return

  try {
    await Notification.requestPermission()
  } catch {
    // Safari viejo responde por callback en vez de promesa. Sin permiso el
    // escáner funciona igual, solo que sin aviso.
  }
}

/** Cerrar el modal NO cancela: la lectura sigue y queda la píldora. */
export function minimizarEscaneo() {
  if (!escaneo || !escaneo.enPantalla) return

  const analizando = escaneo.fase === 'analizando'
  actualizar(escaneo.id, { enPantalla: false })

  if (analizando) void pedirPermisoDeAviso()
}

export function mostrarEscaneo() {
  if (!escaneo || escaneo.enPantalla) return
  avisoPendiente = false
  actualizar(escaneo.id, { enPantalla: true })
}

/** La única forma de perder un comprobante: pedirlo. */
export function descartarEscaneo() {
  abortador?.abort()
  abortador = null
  avisoPendiente = false
  if (escaneo) publicar(null)
}

/** La app volvió al frente después de un aviso: se abre lo que quedó listo. */
export function retomarAlVolver() {
  if (!avisoPendiente || !escaneo) return
  avisoPendiente = false
  actualizar(escaneo.id, { enPantalla: true })
}

function suscribir(avisar: () => void) {
  escuchas.add(avisar)
  return () => {
    escuchas.delete(avisar)
  }
}

function leer() {
  return escaneo
}

/** Siempre `null` en el servidor: no hay archivo que leer del otro lado. */
function leerEnServidor(): Escaneo | null {
  return null
}

export function useEscaneo() {
  return useSyncExternalStore(suscribir, leer, leerEnServidor)
}
