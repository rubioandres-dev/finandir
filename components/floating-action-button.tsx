'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, FileUp, PenLine, Plus } from 'lucide-react'
import { DocumentScannerModal } from '@/components/document-scanner-modal'
import { QuickEntryModal } from '@/components/quick-entry-modal'
import { consumirAccionRapida, useAccionRapidaPendiente } from '@/components/url-action-handler'
import type { CuentaElegible } from '@/lib/types'

/** Mismo tope que la API: rechazarlo acá ahorra subir 20 MB para nada. */
const TAMANO_MAXIMO = 8 * 1024 * 1024

/** Una opción del dial. `retraso` escalona la entrada de las tres. */
function AccionDial({
  etiqueta,
  Icono,
  retraso,
  resaltado = false,
  alTocar,
}: {
  etiqueta: string
  Icono: typeof Camera
  retraso: number
  /** Marca la opción que el atajo de la PWA vino a buscar. */
  resaltado?: boolean
  alTocar: () => void
}) {
  return (
    <button
      type="button"
      onClick={alTocar}
      style={{ animationDelay: `${retraso}ms` }}
      className={`fab-accion flex cursor-pointer items-center gap-2.5 rounded-full border bg-menu py-2 pl-3.5 pr-2 text-xs font-medium text-on-background shadow-2xl transition active:scale-95 hover:border-gold-leaf ${
        resaltado ? 'border-gold-leaf ring-2 ring-gold-leaf/40' : 'border-glass-stroke'
      }`}
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
 *
 * ATAJOS DE LA PWA
 *
 * Este componente es también el destino de los atajos del launcher, que
 * `<UrlActionHandler>` deja como solicitud pendiente. Lo que la solicitud pide
 * se DERIVA del store en el render —no se copia a estado local— por dos
 * motivos: copiarlo exige un `setState` dentro de un efecto, que el compilador
 * de React marca, y mete un render intermedio en el que se ve el dashboard
 * pelado antes del modal. Derivado, el modal entra en el mismo commit.
 */
export function FloatingActionButton({
  categorias,
  cuentas = [],
}: {
  categorias: { nombre: string; tipo: 'INCOME' | 'EXPENSE' }[]
  cuentas?: CuentaElegible[]
}) {
  const [abierto, setAbierto] = useState(false)
  const [cargaRapida, setCargaRapida] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const inputCamara = useRef<HTMLInputElement>(null)
  const inputArchivo = useRef<HTMLInputElement>(null)

  const solicitud = useAccionRapidaPendiente()

  /** El atajo "Nuevo Gasto" abre la hoja de carga rápida, ya con foco en el campo. */
  const mostrarCargaRapida = cargaRapida || solicitud?.accion === 'new-expense'

  /**
   * El atajo "Escanear" llegó pero la cámara no se puede abrir sola: falta el
   * toque del usuario. Se abre el dial con "Tomar foto" resaltado —un toque, y
   * la cámara sale—, que es preferible a un atajo que aparenta no hacer nada.
   */
  const esperandoFoto = solicitud?.accion === 'scan-receipt' && !solicitud.puedeAbrirCamara

  const dialAbierto = abierto || esperandoFoto

  /**
   * Único caso que necesita un efecto: disparar la cámara.
   *
   * Es un side effect sobre el DOM (click en un input oculto), no estado, y los
   * refs solo son seguros de leer fuera del render.
   */
  useEffect(() => {
    if (solicitud?.accion !== 'scan-receipt' || !solicitud.puedeAbrirCamara) return
    consumirAccionRapida()
    inputCamara.current?.click()
  }, [solicitud])

  function cerrarDial() {
    setAbierto(false)
    // Apaga el resaltado si el usuario descartó el atajo sin usarlo.
    consumirAccionRapida()
  }

  function cerrarCargaRapida() {
    setCargaRapida(false)
    consumirAccionRapida()
  }

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
      {dialAbierto && (
        <button
          type="button"
          aria-label="Cerrar acciones rápidas"
          onClick={cerrarDial}
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

        {/* Solo con el atajo del launcher: es la única forma de que el usuario
            entienda por qué quedó mirando el dial en vez de la cámara. */}
        {esperandoFoto && !error && (
          <p
            role="status"
            className="max-w-[15rem] rounded-xl border border-gold-leaf/30 bg-menu px-3 py-2 text-[11px] leading-snug text-gold-leaf shadow-2xl"
          >
            Tocá «Tomar foto» para abrir la cámara.
          </p>
        )}

        {/* Las tres acciones van escritas una por una y no mapeadas desde un
            array: armar ese array en el cuerpo del render mete los refs de los
            inputs en closures que la regla `react-hooks/refs` marca, y con
            razón — un ref leído durante el render no dispara actualizaciones. */}
        {dialAbierto && (
          <>
            <AccionDial
              etiqueta="Nuevo movimiento"
              Icono={PenLine}
              retraso={0}
              alTocar={() => {
                cerrarDial()
                setCargaRapida(true)
              }}
            />
            <AccionDial
              etiqueta="Tomar foto"
              Icono={Camera}
              retraso={45}
              resaltado={esperandoFoto}
              alTocar={() => {
                consumirAccionRapida()
                inputCamara.current?.click()
              }}
            />
            <AccionDial
              etiqueta="Subir documento"
              Icono={FileUp}
              retraso={90}
              alTocar={() => {
                consumirAccionRapida()
                inputArchivo.current?.click()
              }}
            />
          </>
        )}

        <button
          type="button"
          onClick={() => {
            setAbierto(!dialAbierto)
            consumirAccionRapida()
            setError(null)
          }}
          aria-expanded={dialAbierto}
          aria-label={dialAbierto ? 'Cerrar acciones rápidas' : 'Acciones rápidas'}
          className="fire-gradient glow-gold grid size-14 cursor-pointer place-items-center rounded-full text-midnight-navy shadow-2xl transition active:scale-90"
        >
          <Plus
            className={`size-7 transition-transform duration-200 ${dialAbierto ? 'rotate-45' : ''}`}
            aria-hidden
          />
        </button>
      </div>

      {mostrarCargaRapida && (
        <QuickEntryModal categorias={categorias} cuentas={cuentas} onCerrar={cerrarCargaRapida} />
      )}

      {archivo && (
        <DocumentScannerModal
          archivo={archivo}
          // El escáner solo necesita los nombres: son la lista de la que la IA
          // elige, y el tipo lo fija el comprobante (siempre es un gasto).
          categorias={categorias.map((c) => c.nombre)}
          cuentas={cuentas}
          onCerrar={() => setArchivo(null)}
        />
      )}
    </>
  )
}
