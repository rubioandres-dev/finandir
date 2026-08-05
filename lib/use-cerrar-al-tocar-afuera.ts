'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * Cierra un panel flotante al tocar afuera o al apretar Escape.
 *
 * Un panel que solo se cierra con su propio botón es una trampa en mobile.
 *
 * `cerrar` se guarda en un ref, y el ref se escribe dentro de un efecto y no
 * en el cuerpo del hook: escribirlo durante el render es justo lo que React
 * pide no hacer. Así quien llama puede pasar una función nueva en cada render
 * sin que los listeners se den de baja y de alta cada vez.
 */
export function useCerrarAlTocarAfuera(
  contenedor: RefObject<HTMLElement | null>,
  abierto: boolean,
  cerrar: () => void
) {
  const cerrarRef = useRef(cerrar)

  useEffect(() => {
    cerrarRef.current = cerrar
  }, [cerrar])

  useEffect(() => {
    if (!abierto) return

    function alTocarAfuera(evento: MouseEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) cerrarRef.current()
    }
    function alEscapar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') cerrarRef.current()
    }

    document.addEventListener('mousedown', alTocarAfuera)
    document.addEventListener('keydown', alEscapar)
    return () => {
      document.removeEventListener('mousedown', alTocarAfuera)
      document.removeEventListener('keydown', alEscapar)
    }
  }, [abierto, contenedor])
}
