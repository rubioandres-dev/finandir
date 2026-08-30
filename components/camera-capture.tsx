'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Images, Loader2, RefreshCw, X } from 'lucide-react'
import { useTraduccion } from '@/components/currency-provider'
import { useCierreConAtras } from '@/lib/use-cierre-con-atras'

/**
 * CÁMARA PROPIA, Y NO `<input capture="environment">`
 *
 * `capture="environment"` NO es una orden: es una pista. Chrome en Android la
 * traduce a un extra del intent que le manda a la app de cámara del sistema, y
 * esa app es libre de ignorarla. En la práctica muchas —Samsung entre ellas—
 * abren con el último lente que se usó, así que quien sacó una selfie el día
 * anterior encuentra la frontal apuntándole a la cara cuando quiere fotografiar
 * un ticket. No hay atributo que lo arregle: la decisión no es del navegador.
 *
 * Acá el flujo lo pide la app con `getUserMedia({ facingMode: { exact:
 * 'environment' } })`, que sí es una restricción dura: o da la cámara trasera,
 * o falla. Y falla solo donde no hay trasera (una webcam de escritorio), que es
 * justo donde se quiere caer a la que haya.
 *
 * De regalo, el encuadre sale a 2560px de ancho como mucho, así que ningún
 * comprobante choca contra el tope de 8 MB de la API, cosa que sí pasaba con
 * las fotos de 12 MP que devuelve la cámara del sistema.
 */

type Estado = 'iniciando' | 'listo' | 'sin-permiso' | 'sin-camara' | 'error'
type Lente = 'environment' | 'user'

/** ¿Se puede abrir la cámara adentro de la app? Solo en contextos seguros. */
export function hayCamaraEnLaApp() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

function detener(flujo: MediaStream | null) {
  flujo?.getTracks().forEach((pista) => pista.stop())
}

/**
 * Pide el lente pedido, y si no existe se conforma con el que haya.
 *
 * `exact` primero a propósito: es lo único que garantiza la trasera en un
 * celular. `ideal` como red es lo que hace que esto también funcione en una
 * notebook, donde la única cámara es la de arriba de la pantalla.
 */
async function pedirCamara(lente: Lente) {
  const calidad = { width: { ideal: 2560 }, height: { ideal: 1440 } }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { ...calidad, facingMode: { exact: lente } },
      audio: false,
    })
  } catch (error) {
    const nombre = error instanceof Error ? error.name : ''

    // Solo se reintenta si el problema fue el lente. Un permiso denegado
    // vuelve a denegarse, y reintentar solo agrega un segundo de espera.
    if (nombre !== 'OverconstrainedError' && nombre !== 'NotFoundError') throw error

    return await navigator.mediaDevices.getUserMedia({
      video: { ...calidad, facingMode: { ideal: lente } },
      audio: false,
    })
  }
}

/**
 * Visor de cámara a pantalla completa para fotografiar un comprobante.
 *
 * Al portal de `document.body` por el mismo motivo que el escáner: lo abre el
 * FAB, que es `fixed`.
 */
export function CameraCapture({
  onCapturar,
  onCerrar,
  onCamaraDelSistema,
}: {
  /** La foto ya lista para mandar a analizar. */
  onCapturar: (archivo: File) => void
  onCerrar: () => void
  /** Salida de emergencia: el selector de archivos y la cámara del sistema. */
  onCamaraDelSistema: () => void
}) {
  const { t } = useTraduccion()

  const [estado, setEstado] = useState<Estado>('iniciando')
  const [lente, setLente] = useState<Lente>('environment')

  const video = useRef<HTMLVideoElement>(null)
  const flujo = useRef<MediaStream | null>(null)

  useEffect(() => {
    let vivo = true

    async function abrir() {
      try {
        const obtenido = await pedirCamara(lente)

        // El modal se cerró mientras el usuario decidía el permiso: hay que
        // apagar el flujo igual o la luz de la cámara queda prendida.
        if (!vivo) {
          detener(obtenido)
          return
        }

        flujo.current = obtenido

        if (video.current) {
          video.current.srcObject = obtenido
          // Safari rechaza el play() si el gesto ya venció; el `autoplay` del
          // elemento igual arranca, así que el error no importa.
          await video.current.play().catch(() => {})
        }

        setEstado('listo')
      } catch (error) {
        if (!vivo) return

        const nombre = error instanceof Error ? error.name : ''

        if (nombre === 'NotAllowedError' || nombre === 'SecurityError') setEstado('sin-permiso')
        else if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError')
          setEstado('sin-camara')
        else setEstado('error')
      }
    }

    void abrir()

    return () => {
      vivo = false
      detener(flujo.current)
      flujo.current = null
    }
  }, [lente])

  // Sin esto, el gesto de atrás con la cámara abierta cierra la PWA entera.
  useCierreConAtras(true, onCerrar)

  useEffect(() => {
    function alEscapar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alEscapar)
    return () => document.removeEventListener('keydown', alEscapar)
  }, [onCerrar])

  function capturar() {
    const elemento = video.current
    if (!elemento?.videoWidth) return

    // Se copia el cuadro tal como lo entrega el sensor, sin escalarlo: el
    // recorte de la pantalla es `object-cover` y recortaría el ticket.
    const lienzo = document.createElement('canvas')
    lienzo.width = elemento.videoWidth
    lienzo.height = elemento.videoHeight
    lienzo.getContext('2d')?.drawImage(elemento, 0, 0)

    lienzo.toBlob(
      (imagen) => {
        if (!imagen) return
        onCapturar(new File([imagen], 'comprobante.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92
    )
  }

  if (typeof document === 'undefined') return null

  const falla = estado === 'sin-permiso' || estado === 'sin-camara' || estado === 'error'

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('camara.titulo')}
      className="fixed inset-0 z-[90] flex flex-col bg-black"
    >
      {/* El visor. `playsInline` es obligatorio en iOS: sin eso el video se
          abre en el reproductor a pantalla completa del sistema. */}
      <video
        ref={video}
        playsInline
        muted
        autoPlay
        aria-hidden
        className={`min-h-0 flex-1 object-cover ${lente === 'user' ? 'scale-x-[-1]' : ''} ${
          estado === 'listo' ? '' : 'opacity-0'
        }`}
      />

      {estado === 'iniciando' && (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2.5"
        >
          <Loader2 className="size-7 animate-spin text-gold-leaf" aria-hidden />
          <p className="text-xs text-white/70">{t('camara.abriendo')}</p>
        </div>
      )}

      {falla && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-sm leading-snug text-white/80">
            {estado === 'sin-permiso'
              ? t('camara.sinPermiso')
              : estado === 'sin-camara'
                ? t('camara.sinCamara')
                : t('camara.error')}
          </p>

          {/* La caída necesita un toque propio: disparar el `<input>` oculto
              por programa exige activación del usuario, y la que abrió este
              visor ya venció mientras se resolvía el permiso. */}
          <button
            type="button"
            onClick={onCamaraDelSistema}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/25 px-4 py-2.5 text-sm text-white transition active:scale-95"
          >
            <Images className="size-4" aria-hidden />
            {t('camara.usarSistema')}
          </button>
        </div>
      )}

      {/* --- Controles ------------------------------------------------------ */}
      <div className="flex items-center justify-between gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
        <button
          type="button"
          onClick={onCerrar}
          aria-label={t('comun.cerrar')}
          className="grid size-11 cursor-pointer place-items-center rounded-full text-white/80 transition active:scale-90 hover:bg-white/10"
        >
          <X className="size-5" aria-hidden />
        </button>

        <button
          type="button"
          onClick={capturar}
          disabled={estado !== 'listo'}
          aria-label={t('camara.disparar')}
          className="grid size-[4.5rem] cursor-pointer place-items-center rounded-full border-4 border-white/90 bg-white/15 text-white transition active:scale-90 disabled:opacity-40"
        >
          <Camera className="size-7" aria-hidden />
        </button>

        {/* Cambiar de lente sigue estando, pero como excepción y no como
            estado inicial: se arranca SIEMPRE en la trasera. */}
        <button
          type="button"
          onClick={() => setLente((actual) => (actual === 'environment' ? 'user' : 'environment'))}
          disabled={falla}
          aria-label={t('camara.cambiarLente')}
          className="grid size-11 cursor-pointer place-items-center rounded-full text-white/80 transition active:scale-90 disabled:opacity-30 hover:bg-white/10"
        >
          <RefreshCw className="size-5" aria-hidden />
        </button>
      </div>
    </div>,
    document.body
  )
}
