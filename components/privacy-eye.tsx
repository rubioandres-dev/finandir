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
 * Vive en su propio archivo porque `<BalanceOverviewCard>` es un Server
 * Component —formatea los importes en el servidor— y este botón necesita
 * estado de cliente. Un componente de cliente adentro de uno de servidor es
 * exactamente la costura que hace falta.
 *
 * `cambiando` lo deshabilita mientras el servidor vuelve a renderizar: media
 * app formatea del lado del servidor, así que hasta que no vuelve el refresh
 * la pantalla está a medio camino, y aceptar otro toque ahí deja al ojito
 * diciendo una cosa y a los importes mostrando otra.
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
      disabled={cambiando}
      aria-pressed={oculto}
      aria-label={etiqueta}
      title={etiqueta}
      // Mismo alto y mismo borde que el selector de moneda que tiene al lado:
      // los dos son controles de cómo se lee el número de abajo.
      className={`grid size-[1.875rem] shrink-0 cursor-pointer place-items-center rounded-xl border bg-surface-container/60 transition active:scale-95 disabled:opacity-60 ${
        oculto
          ? 'border-gold-leaf/60 text-gold-leaf'
          : 'border-glass-stroke/60 text-on-surface-variant hover:border-gold-leaf/60 hover:text-gold-leaf'
      }`}
    >
      <Icono className="size-4" aria-hidden />
    </button>
  )
}
