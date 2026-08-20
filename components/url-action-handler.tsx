'use client'

import { Suspense, useEffect, useRef, useSyncExternalStore } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/** Acciones que los atajos del launcher pueden pedir sobre el dashboard. */
export type AccionRapida = 'new-expense' | 'scan-receipt'

export type SolicitudRapida = {
  accion: AccionRapida
  /** Distingue dos pedidos iguales seguidos, que serían el mismo objeto. */
  secuencia: number
  /**
   * ¿Se puede abrir la cámara por programa?
   *
   * Los navegadores solo muestran el selector de archivos —y con él la cámara—
   * si el documento tuvo activación del usuario. Entrar desde un atajo del
   * launcher NO cuenta: el documento arranca sin activación y un `.click()`
   * sobre el input se descarta en silencio, sin error que atrapar.
   *
   * Se resuelve acá, en el momento en que llega la acción, y no en el FAB: el
   * FAB lo necesita en tiempo de render y `navigator` no existe en el servidor.
   */
  puedeAbrirCamara: boolean
}

/**
 * PUENTE ENTRE EL ATAJO Y EL BOTÓN FLOTANTE
 *
 * El que lee la URL (`<UrlActionHandler>`) y el que abre los modales
 * (`<FloatingActionButton>`) son HERMANOS en el árbol, y su padre —el layout
 * del dashboard— es un server component: no hay estado de React que los una
 * sin envolver medio layout en un provider cliente.
 *
 * De ahí este store de módulo. Y GUARDA la solicitud en vez de emitirla al
 * aire, por una razón concreta: los efectos de dos hermanos corren en el mismo
 * commit y el orden no está garantizado. Si el handler emitiera antes de que el
 * FAB se suscriba, el atajo no haría nada. Latcheada, el FAB la levanta en
 * cuanto monta, corra antes o después.
 */
let solicitud: SolicitudRapida | null = null
let secuencia = 0
const escuchas = new Set<() => void>()

function emitir(accion: AccionRapida, puedeAbrirCamara: boolean) {
  secuencia += 1
  solicitud = { accion, secuencia, puedeAbrirCamara }
  escuchas.forEach((avisar) => avisar())
}

/**
 * Marca la solicitud como atendida.
 *
 * Sin esto quedaría latcheada para siempre: volvería a dispararse si el FAB se
 * desmonta y vuelve a montar, y el resaltado del dial no se apagaría nunca.
 */
export function consumirAccionRapida() {
  if (!solicitud) return
  solicitud = null
  escuchas.forEach((avisar) => avisar())
}

function suscribir(avisar: () => void) {
  escuchas.add(avisar)
  return () => {
    escuchas.delete(avisar)
  }
}

function leer() {
  return solicitud
}

/** Siempre `null` en el servidor: la acción existe solo del lado del cliente. */
function leerEnServidor(): SolicitudRapida | null {
  return null
}

/**
 * La solicitud pendiente, o `null`.
 *
 * El consumidor deriva su UI de esto en vez de copiarlo a estado local: copiarlo
 * exigiría un `setState` dentro de un efecto —que el compilador de React marca—
 * y agregaría un render de más justo cuando se está abriendo un modal.
 */
export function useAccionRapidaPendiente() {
  return useSyncExternalStore(suscribir, leer, leerEnServidor)
}

/**
 * Lee `?action=` y lo traduce a una acción.
 *
 * Va aparte del componente exportado porque `useSearchParams()` suspende
 * durante el prerender, y sin un límite propio esa suspensión se propagaría al
 * layout entero.
 */
function LectorDeAccion() {
  const router = useRouter()
  const parametros = useSearchParams()
  const accion = parametros.get('action')

  /**
   * Una acción se atiende UNA vez.
   *
   * En desarrollo, el modo estricto monta, limpia y vuelve a montar el efecto
   * sobre la misma instancia; sin este candado el atajo dispararía dos veces
   * (dos clicks al input de cámara, por ejemplo). El ref sobrevive al doble
   * montaje, que es justo lo que se necesita acá.
   */
  const atendida = useRef<string | null>(null)

  useEffect(() => {
    if (!accion || atendida.current === accion) return
    atendida.current = accion

    if (accion === 'new-expense' || accion === 'scan-receipt') {
      // `userActivation` no existe en Safari; ahí la respuesta es "no" y se cae
      // al camino con un toque de más, que funciona en todos lados.
      emitir(accion, navigator.userActivation?.hasBeenActive ?? false)
    } else if (accion === 'balance') {
      // El atajo "Balance" del manifiesto apunta derecho a
      // /dashboard/consolidated; esto es la red por si llega como acción.
      router.replace('/dashboard/consolidated')
      return
    } else {
      // Acción desconocida: no se toca la URL, puede ser un parámetro ajeno.
      return
    }

    // Se borra el `?action=` para que un refresh —o el "atrás" del navegador—
    // no vuelva a abrir el modal. `replaceState` nativo y no `router.replace`:
    // no dispara navegación ni re-render del árbol, que es exactamente lo que
    // se quiere mientras se está abriendo un modal.
    window.history.replaceState({}, '', window.location.pathname)
  }, [accion, router])

  return null
}

/**
 * Traduce los atajos de la PWA (`/dashboard?action=…`) en acciones del dashboard.
 *
 * Al mantener presionado el ícono de AUREM, Android ofrece "Nuevo Gasto" y
 * "Escanear": los dos entran por acá. No pinta nada; solo lee la URL, avisa al
 * botón flotante y deja la barra de direcciones limpia.
 */
export function UrlActionHandler() {
  return (
    <Suspense fallback={null}>
      <LectorDeAccion />
    </Suspense>
  )
}
