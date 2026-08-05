'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Camera, FileUp, PenLine, Plus } from 'lucide-react'
import { DocumentScannerModal } from '@/components/document-scanner-modal'
import type { CuentaElegible } from '@/lib/types'

/** Mismo tope que la API: rechazarlo acá ahorra subir 20 MB para nada. */
const TAMANO_MAXIMO = 8 * 1024 * 1024

/** Una opción del dial. `retraso` escalona la entrada de las tres. */
function AccionDial({
  etiqueta,
  Icono,
  retraso,
  alTocar,
}: {
  etiqueta: string
  Icono: typeof Camera
  retraso: number
  alTocar: () => void
}) {
  return (
    <button
      type="button"
      onClick={alTocar}
      style={{ animationDelay: `${retraso}ms` }}
      className="fab-accion flex cursor-pointer items-center gap-2.5 rounded-full border border-glass-stroke bg-menu py-2 pl-3.5 pr-2 text-xs font-medium text-on-background shadow-2xl transition active:scale-95 hover:border-gold-leaf"
    >
      {etiqueta}
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-leaf/10 text-gold-leaf">
        <Icono className="size-4" aria-hidden />
      </span>
    </button>
  )
}

/**
 * Acceso rápido a las tres formas de cargar un movimiento.
 *
 * POR QUÉ DOS `<input type="file">` Y NO UNO
 *
 * `capture="environment"` no es un filtro: es una orden. Le dice al navegador
 * móvil que abra la cámara trasera directo, sin pasar por el selector de
 * archivos. Eso es lo que se quiere en "Tomar foto" y lo que NO se quiere en
 * "Subir documento", donde hay que llegar al explorador y a los PDF. Un solo
 * input no puede hacer las dos cosas, así que son dos.
 *
 * En escritorio `capture` se ignora y los dos abren el explorador; la opción
 * de cámara igual sirve si hay webcam.
 */
export function FloatingActionButton({
  categorias,
  cuentas = [],
}: {
  categorias: string[]
  cuentas?: CuentaElegible[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const inputCamara = useRef<HTMLInputElement>(null)
  const inputArchivo = useRef<HTMLInputElement>(null)

  function alElegirArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const elegido = evento.target.files?.[0]

    // Se limpia SIEMPRE: sin esto, elegir dos veces el mismo archivo no vuelve
    // a disparar `change` y el segundo intento parece que no hace nada.
    evento.target.value = ''

    if (!elegido) return

    if (elegido.size > TAMANO_MAXIMO) {
      setError(`El archivo pesa ${(elegido.size / 1024 / 1024).toFixed(1)} MB. El máximo es 8 MB.`)
      return
    }

    setError(null)
    setArchivo(elegido)
    setAbierto(false)
  }

  return (
    <>
      <input
        ref={inputCamara}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={alElegirArchivo}
        className="hidden"
        tabIndex={-1}
        aria-hidden
      />
      <input
        ref={inputArchivo}
        type="file"
        accept="image/*,application/pdf"
        onChange={alElegirArchivo}
        className="hidden"
        tabIndex={-1}
        aria-hidden
      />

      {/* Telón: cierra al tocar afuera. Solo existe con el dial abierto, así
          que no le roba toques a la app el resto del tiempo. */}
      {abierto && (
        <button
          type="button"
          aria-label="Cerrar acciones rápidas"
          onClick={() => setAbierto(false)}
          className="fixed inset-0 z-40 cursor-default bg-midnight-navy/40 backdrop-blur-[2px]"
        />
      )}

      <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2.5 md:bottom-8 md:right-8">
        {error && (
          <p
            role="alert"
            className="max-w-[15rem] rounded-xl border border-expense/30 bg-menu px-3 py-2 text-[11px] leading-snug text-expense shadow-2xl"
          >
            {error}
          </p>
        )}

        {/* Las tres acciones van escritas una por una y no mapeadas desde un
            array: armar ese array en el cuerpo del render mete los refs de los
            inputs en closures que la regla `react-hooks/refs` marca, y con
            razón — un ref leído durante el render no dispara actualizaciones. */}
        {abierto && (
          <>
            <AccionDial
              etiqueta="Nuevo movimiento"
              Icono={PenLine}
              retraso={0}
              alTocar={() => {
                setAbierto(false)
                // El Smart Input vive en el dashboard; el hash lo enfoca al llegar.
                router.push('/dashboard#smart-input')
              }}
            />
            <AccionDial
              etiqueta="Tomar foto"
              Icono={Camera}
              retraso={45}
              alTocar={() => inputCamara.current?.click()}
            />
            <AccionDial
              etiqueta="Subir documento"
              Icono={FileUp}
              retraso={90}
              alTocar={() => inputArchivo.current?.click()}
            />
          </>
        )}

        <button
          type="button"
          onClick={() => {
            setAbierto((previo) => !previo)
            setError(null)
          }}
          aria-expanded={abierto}
          aria-label={abierto ? 'Cerrar acciones rápidas' : 'Acciones rápidas'}
          className="fire-gradient glow-gold grid size-14 cursor-pointer place-items-center rounded-full text-midnight-navy shadow-2xl transition active:scale-90"
        >
          <Plus
            className={`size-7 transition-transform duration-200 ${abierto ? 'rotate-45' : ''}`}
            aria-hidden
          />
        </button>
      </div>

      {archivo && (
        <DocumentScannerModal
          archivo={archivo}
          categorias={categorias}
          cuentas={cuentas}
          onCerrar={() => setArchivo(null)}
        />
      )}
    </>
  )
}
