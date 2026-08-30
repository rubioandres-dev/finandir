'use client'

import { useEffect, useRef } from 'react'

/**
 * QUE EL "ATRÁS" DEL TELÉFONO CIERRE LA CAPA, NO LA APP
 *
 * En el navegador, el gesto de atrás con un modal abierto navega a la página
 * anterior y deja al usuario en otro lado con el modal desaparecido. En la PWA
 * instalada es peor: si se entró desde el launcher no hay página anterior, y
 * el gesto CIERRA LA APP. Alguien que sacó la foto de un ticket y quiso volver
 * al encuadre se queda sin la app y sin el comprobante.
 *
 * Este hook hace que ese gesto sea lo mismo que tocar afuera del modal.
 *
 * DOS CAMINOS
 *
 * `CloseWatcher` es la API que el navegador ofrece justo para esto: entiende
 * el gesto de atrás, la tecla Escape y el orden entre varias capas abiertas, y
 * —lo importante— NO toca el historial, así que no deja entradas fantasma que
 * limpiar. Está en Chrome 120+, que es el caso que importa acá: la PWA
 * instalada en Android.
 *
 * Donde no está (Safari, Firefox) se cae al truco de siempre: empujar una
 * entrada de historial de mentira al abrir, que el gesto consume en vez de
 * navegar. Todo el cuidado del respaldo está en sacarla después, porque una
 * entrada que quedó colgada convierte el siguiente "atrás" en un gesto que no
 * hace nada.
 */

/** `CloseWatcher` todavía no está en `lib.dom.d.ts` (TypeScript 5.9). */
type Guardia = { destroy: () => void; onclose: (() => void) | null }
type VentanaConGuardia = { CloseWatcher?: new () => Guardia }

export function useCierreConAtras(activo: boolean, alCerrar: () => void) {
  const cierre = useRef(alCerrar)

  // El ref se refresca en un efecto y no en el render porque leer o escribir
  // un ref durante el render no dispara actualizaciones y la regla
  // `react-hooks/refs` lo marca. Sirve para que el efecto de abajo dependa
  // SOLO de `activo`: si dependiera de la función —que en la mayoría de los
  // llamadores se crea en cada render— desmontaría y volvería a montar la
  // entrada de historial con cada tecla que se escriba adentro del modal.
  useEffect(() => {
    cierre.current = alCerrar
  }, [alCerrar])

  useEffect(() => {
    if (!activo) return

    const Guardia = (window as unknown as VentanaConGuardia).CloseWatcher

    if (Guardia) {
      const guardia = new Guardia()
      guardia.onclose = () => cierre.current()
      return () => guardia.destroy()
    }

    /** ¿Se la llevó el gesto? Entonces ya no hay nada que sacar del historial. */
    let consumida = false

    // Se conserva el `state` que había: adentro viaja el árbol de rutas del
    // App Router, y pisarlo con un objeto propio deja al router de Next sin
    // saber dónde está parado cuando el usuario vuelva atrás de verdad.
    window.history.pushState({ ...window.history.state, aurem_capa: true }, '')

    function alVolver() {
      consumida = true
      cierre.current()
    }

    window.addEventListener('popstate', alVolver)

    return () => {
      window.removeEventListener('popstate', alVolver)

      // Se cerró con un botón nuestro, no con el gesto: la entrada falsa sigue
      // arriba y hay que sacarla. Pero solo si TODAVÍA es la de arriba: si el
      // usuario navegó a otra ruta con el modal abierto, la nuestra quedó
      // enterrada y un `back()` acá le desharía la navegación.
      if (!consumida && (window.history.state as { aurem_capa?: boolean } | null)?.aurem_capa) {
        window.history.back()
      }
    }
  }, [activo])
}

/**
 * Se come el gesto de atrás sin cerrar nada.
 *
 * Para las capas OBLIGATORIAS —hoy solo el onboarding—, donde las dos salidas
 * posibles son malas: cerrar el modal saltea un paso que la app necesita, y
 * dejar pasar el gesto cierra la app. La tercera es que no pase nada.
 *
 * Acá no sirve `CloseWatcher`: su contrato es "esto se cierra", y quedarse
 * abierto en el `onclose` es pelearle a la API. El truco del historial sí
 * modela esto bien — se vuelve a empujar la entrada que el gesto consumió—, y
 * como no hay nada que cerrar tampoco hay un cierre por botón que desarmar.
 *
 * Ojo con lo que implica: mientras esté activo, el "atrás" deja de sacar de la
 * app. Quedan el botón de inicio y el conmutador de aplicaciones, que el
 * sistema garantiza y ninguna web puede tocar.
 */
export function useAtrasRetenido(activo: boolean) {
  useEffect(() => {
    if (!activo) return

    const empujar = () =>
      window.history.pushState({ ...window.history.state, aurem_capa: true }, '')

    empujar()
    window.addEventListener('popstate', empujar)

    return () => {
      window.removeEventListener('popstate', empujar)
      if ((window.history.state as { aurem_capa?: boolean } | null)?.aurem_capa) {
        window.history.back()
      }
    }
  }, [activo])
}
