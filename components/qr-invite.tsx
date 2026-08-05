'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Loader2, QrCode, X } from 'lucide-react'
import jsQR from 'jsqr'
import QRCode from 'qrcode'
import { useTraduccion } from '@/components/currency-provider'

/**
 * El QR codifica una URL, no un id pelado.
 *
 * Con una URL, cualquier cámara de teléfono sirve: el sistema operativo la
 * reconoce y ofrece abrirla. Si codificara solo el UUID, el que escanea con la
 * cámara nativa vería un texto sin sentido y habría que obligarlo a instalar la
 * app primero. El escáner de adentro también acepta el UUID suelto, por si
 * alguien comparte el id a mano.
 */
export function enlaceDeInvitacion(spaceId: string): string {
  const origen = typeof window === 'undefined' ? '' : window.location.origin
  return `${origen}/dashboard/shared-expenses/join/${spaceId}`
}

/** Modal con el QR del grupo y el enlace para copiar. */
export function QrInviteModal({ spaceId, onCerrar }: { spaceId: string; onCerrar: () => void }) {
  const { t } = useTraduccion()
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const enlace = enlaceDeInvitacion(spaceId)

  useEffect(() => {
    let cancelado = false

    QRCode.toDataURL(enlace, {
      width: 512,
      margin: 2,
      // Fondo claro y módulos oscuros aunque la app sea noir: un QR invertido
      // lo rechazan la mitad de los lectores.
      color: { dark: '#0a0c14', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelado) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelado) setDataUrl(null)
      })

    return () => {
      cancelado = true
    }
  }, [enlace])

  useEffect(() => {
    function alEscapar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alEscapar)
    return () => document.removeEventListener('keydown', alEscapar)
  }, [onCerrar])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('compartidos.mostrarQr')}
      className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label={t('comun.cerrar')}
        onClick={onCerrar}
        className="absolute inset-0 bg-midnight-navy/70 backdrop-blur-sm"
      />

      <div className="glass-card relative z-10 flex w-full max-w-sm flex-col items-center gap-4 rounded-t-3xl bg-menu px-5 pt-5 respiro-hoja sm:rounded-3xl">
        <div className="flex w-full items-center justify-between gap-3">
          <h3 className="aurem-caps text-[11px] text-gold-leaf">{t('compartidos.mostrarQr')}</h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={t('comun.cerrar')}
            className="grid size-7 cursor-pointer place-items-center rounded-md text-subtle transition hover:bg-foreground/5"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- es un data: URI generado en el cliente
          <img
            src={dataUrl}
            alt={t('compartidos.mostrarQr')}
            className="w-full max-w-[15rem] rounded-xl"
          />
        ) : (
          <div className="grid h-60 w-full place-items-center">
            <Loader2 className="size-6 animate-spin text-gold-leaf" aria-hidden />
          </div>
        )}

        <p className="text-center text-[11px] leading-snug text-subtle">
          {t('compartidos.qrAyuda')}
        </p>

        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(enlace)
              setCopiado(true)
            } catch {
              setCopiado(false)
            }
          }}
          className="btn-gold-subtle w-full cursor-pointer justify-center rounded-xl px-3 py-2.5 text-xs font-semibold"
        >
          {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copiado ? t('compartidos.copiado') : t('compartidos.copiarEnlace')}
        </button>
      </div>
    </div>,
    document.body
  )
}

/**
 * Escáner de QR con la cámara.
 *
 * POR QUÉ jsQR Y NO `BarcodeDetector`
 *
 * La API nativa es más rápida y no pesa nada, pero no existe en Safari — o sea,
 * no existe en iOS, que es donde esta PWA se usa de verdad. jsQR corre sobre un
 * canvas y funciona en todos lados.
 *
 * El bucle usa `requestAnimationFrame` y no un `setInterval`: cuando la pestaña
 * pasa a segundo plano el navegador lo pausa solo, y no se queda decodificando
 * fotogramas de una cámara que nadie mira.
 */
export function QrScannerModal({
  onDetectado,
  onCerrar,
}: {
  onDetectado: (texto: string) => void
  onCerrar: () => void
}) {
  const { t } = useTraduccion()
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let cuadro = 0
    let cancelado = false

    const lienzo = document.createElement('canvas')
    const contexto = lienzo.getContext('2d', { willReadFrequently: true })

    function leer() {
      if (cancelado) return
      const elemento = video.current

      if (elemento && contexto && elemento.readyState === elemento.HAVE_ENOUGH_DATA) {
        lienzo.width = elemento.videoWidth
        lienzo.height = elemento.videoHeight
        contexto.drawImage(elemento, 0, 0, lienzo.width, lienzo.height)

        const imagen = contexto.getImageData(0, 0, lienzo.width, lienzo.height)
        const codigo = jsQR(imagen.data, imagen.width, imagen.height)

        if (codigo?.data) {
          cancelado = true
          onDetectado(codigo.data)
          return
        }
      }

      cuadro = requestAnimationFrame(leer)
    }

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((obtenido) => {
        if (cancelado) {
          obtenido.getTracks().forEach((t) => t.stop())
          return
        }
        stream = obtenido
        if (video.current) {
          video.current.srcObject = obtenido
          void video.current.play()
        }
        cuadro = requestAnimationFrame(leer)
      })
      .catch(() => {
        if (!cancelado) setError('No se pudo abrir la cámara. Revisá los permisos del navegador.')
      })

    return () => {
      cancelado = true
      cancelAnimationFrame(cuadro)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onDetectado])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('compartidos.escanear')}
      className="fixed inset-0 z-[86] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label={t('comun.cerrar')}
        onClick={onCerrar}
        className="absolute inset-0 bg-midnight-navy/85"
      />

      <div className="glass-card relative z-10 flex w-full max-w-sm flex-col gap-3 rounded-t-3xl bg-menu px-5 pt-5 respiro-hoja sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3">
          <h3 className="aurem-caps flex items-center gap-1.5 text-[11px] text-gold-leaf">
            <QrCode className="size-3.5" aria-hidden />
            {t('compartidos.escanear')}
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={t('comun.cerrar')}
            className="grid size-7 cursor-pointer place-items-center rounded-md text-subtle transition hover:bg-foreground/5"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
          >
            {error}
          </p>
        ) : (
          <div className="relative overflow-hidden rounded-xl bg-midnight-navy">
            <video ref={video} playsInline muted className="aspect-square w-full object-cover" />
            {/* Marco guía: sin él, nadie sabe dónde poner el código. */}
            <div
              className="pointer-events-none absolute inset-[15%] rounded-xl border-2 border-gold-leaf/70"
              aria-hidden
            />
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
