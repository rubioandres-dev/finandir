'use client'

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/**
 * Panel flotante anclado a un botón, renderizado FUERA del header.
 *
 * POR QUÉ UN PORTAL Y NO UN `absolute` COMO ANTES
 *
 * Los dos menús del header (notificaciones y perfil) vivían como `absolute`
 * dentro de `<header class="… backdrop-blur-xl">`. Un `backdrop-filter` no es
 * una decoración inocente: hace tres cosas a la vez.
 *
 *   1. Crea un stacking context, así que ningún z-index de adentro puede
 *      escapar del z-50 del header.
 *   2. Crea un containing block para los descendientes absolute y fixed.
 *   3. En WebKit —iOS Safari, que es el navegador real de esta PWA— RECORTA
 *      los descendientes al borde del elemento. Un panel que baja más allá
 *      del header queda cortado: por eso "no abría en mobile".
 *
 * Mientras el panel siga siendo descendiente del header, cualquier arreglo es
 * pelearle a esas tres cosas. Portalearlo a `document.body` las saca a las
 * tres de una vez: ya no hay ancestro con filtro, ni stacking context ajeno, y
 * al ser `fixed` no puede empujar el layout de nadie.
 *
 * La posición se calcula midiendo el botón, que es lo que un `absolute` hacía
 * gratis. Es el precio de salir del subárbol, y es barato.
 *
 * El padre lo monta SOLO cuando está abierto: así no corre un
 * `useLayoutEffect` durante el render del servidor, que React advierte.
 */

/** Separación entre el botón y el panel, y respiro contra los bordes. */
const SEPARACION = 8
const MARGEN = 8
/** Alto mínimo antes de preferir scrollear adentro. */
const ALTO_MINIMO = 140

export function FloatingPanel({
  ancla,
  onCerrar,
  ancho,
  rol,
  etiqueta,
  children,
}: {
  /** Botón que abre el panel: de su caja se cuelga la posición. */
  ancla: RefObject<HTMLElement | null>
  onCerrar: () => void
  /** Clase de ancho de Tailwind, por ejemplo `w-72`. */
  ancho: string
  rol: 'menu' | 'dialog'
  etiqueta: string
  children: React.ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  /**
   * Ubica el panel escribiendo la posición directo en el nodo, ANTES del
   * primer pintado: por eso es un layout effect y no un `useEffect`.
   *
   * No pasa por estado a propósito. Un `setState` acá dispararía un render en
   * cascada por cada scroll y por cada resize, y la regla
   * `react-hooks/set-state-in-effect` lo marca con razón. Mover un nodo del
   * DOM es justo el caso de uso para el que existe un layout effect:
   * sincronizar React con un sistema externo.
   *
   * `ubicar` se define adentro y no en un `useCallback` porque lee
   * `ancla.current`: el React Compiler no puede preservar esa memoización
   * manual y desactiva la optimización de todo el componente.
   */
  useLayoutEffect(() => {
    const boton = ancla.current
    const caja = panel.current
    if (!boton || !caja) return

    const ubicar = () => {
      const marco = boton.getBoundingClientRect()
      const top = marco.bottom + SEPARACION

      caja.style.top = `${top}px`
      // Alineado al borde derecho del botón, sin pasarse de la pantalla.
      caja.style.right = `${Math.max(MARGEN, window.innerWidth - marco.right)}px`
      // Que nunca se salga por abajo: si no entra, scrollea adentro.
      caja.style.maxHeight = `${Math.max(ALTO_MINIMO, window.innerHeight - top - MARGEN)}px`
      caja.style.visibility = 'visible'
    }

    ubicar()

    // El header es sticky, así que su caja no se mueve al scrollear. Se
    // reubica igual porque en mobile la barra de URL y el teclado virtual
    // cambian `innerHeight` sin que haya un resize "de verdad".
    window.addEventListener('resize', ubicar)
    window.addEventListener('scroll', ubicar, true)

    return () => {
      window.removeEventListener('resize', ubicar)
      window.removeEventListener('scroll', ubicar, true)
    }
  }, [ancla])

  useEffect(() => {
    function alEscapar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar()
    }

    document.addEventListener('keydown', alEscapar)
    return () => document.removeEventListener('keydown', alEscapar)
  }, [onCerrar])

  // Foco adentro al abrir y de vuelta al botón al cerrar: sin esto Escape
  // depende de dónde quedó el foco, y un lector de pantalla no se entera de
  // que apareció algo.
  useEffect(() => {
    const boton = ancla.current
    panel.current?.focus({ preventScroll: true })
    return () => boton?.focus({ preventScroll: true })
  }, [ancla])

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      {/*
        Telón: es el que recibe el toque de "cerrar al tocar afuera". Un
        elemento real que recibe un toque real es mucho más confiable en mobile
        que escuchar `mousedown` en el document, que es lo que hacía el hook
        anterior. Oscurece en mobile, donde el panel tapa media pantalla, y es
        invisible en escritorio, donde esto es solo un dropdown.

        `touch-none` evita que arrastrar sobre el telón scrollee la página
        detrás del panel.
      */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="fixed inset-0 z-[60] cursor-default touch-none bg-midnight-navy/40 sm:bg-transparent"
      />

      <div
        ref={panel}
        role={rol}
        aria-label={etiqueta}
        tabIndex={-1}
        // Arranca oculto y lo revela `ubicar()` ya con la posición puesta. El
        // layout effect corre antes del pintado, así que no se ve parpadear.
        style={{ visibility: 'hidden' }}
        className={`fixed z-[70] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-2xl border border-border-strong bg-menu p-1.5 shadow-2xl outline-none ${ancho}`}
      >
        {children}
      </div>
    </>,
    document.body
  )
}
