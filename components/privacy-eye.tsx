'use client'

import { Eye, EyeOff } from 'lucide-react'
import { usePrivacidad, useTraduccion } from '@/components/currency-provider'

/**
 * El ojito: tapa o destapa los importes de TODA la app.
 *
 * POR QUÉ EN LA CARD DE PATRIMONIO Y NO EN EL HEADER
 *
 * Primero estuvo arriba, entre el selector de moneda y la campana. Se perdía:
 * es una fila de íconos grises de 36 px que el ojo lee como "herramientas del
 * sistema", y nadie va a buscar ahí la forma de tapar un saldo.
 *
 * Acá está pegado al número que esconde. Es el gesto de las apps de banco por
 * un motivo: el ojito significa "tapá ESTO", y ese significado lo da la
 * cercanía. Que además tape el resto de la app se descubre al primer toque, y
 * es una sorpresa buena.
 *
 * Vive en su propio archivo para poder ponerlo en cualquier lado sin arrastrar
 * la card entera: hoy está solo en la de patrimonio, pero el bloque del
 * consolidado muestra el mismo número y es el próximo candidato.
 *
 * NO SE DESHABILITA MIENTRAS REFRESCA
 *
 * Lo hacía, y era el motivo de que se sintiera pesado: la card de patrimonio
 * es de cliente y tapa en el acto, así que bloquear el botón hasta que
 * volviera el `router.refresh()` era pedirle al usuario que esperara por un
 * trabajo que ya no está mirando —el de las OTRAS pantallas, que se renderizan
 * en el servidor—. Dos toques seguidos tampoco desincronizan nada: la cookie
 * se escribe sincrónica y gana la última, así que el refresh que llegue al
 * final lee el estado definitivo. Queda `aria-busy` para que un lector de
 * pantalla sepa que algo sigue en curso.
 */
export function OjoDePrivacidad() {
  const { t } = useTraduccion()
  const { oculto, alternar, cambiando } = usePrivacidad()

  const Icono = oculto ? EyeOff : Eye
  const etiqueta = oculto ? t('privacidad.mostrar') : t('privacidad.ocultar')

  return (
    <button
      type="button"
      onClick={alternar}
      aria-busy={cambiando}
      aria-pressed={oculto}
      aria-label={etiqueta}
      title={etiqueta}
      // Mismo alto y mismo borde que el selector de moneda que tiene al lado:
      // los dos son controles de cómo se lee el número de abajo.
      className={`grid size-[1.875rem] shrink-0 cursor-pointer place-items-center rounded-xl border bg-surface-container/60 transition active:scale-95 ${
        oculto
          ? 'border-gold-leaf/60 text-gold-leaf'
          : 'border-glass-stroke/60 text-on-surface-variant hover:border-gold-leaf/60 hover:text-gold-leaf'
      }`}
    >
      <Icono className="size-4" aria-hidden />
    </button>
  )
}
