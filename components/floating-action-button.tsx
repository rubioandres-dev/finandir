'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, Check, FileUp, Loader2, PenLine, Plus, X } from 'lucide-react'
import { CameraCapture, hayCamaraEnLaApp } from '@/components/camera-capture'
import { useTraduccion } from '@/components/currency-provider'
import { DocumentScannerModal } from '@/components/document-scanner-modal'
import {
  descartarEscaneo,
  iniciarEscaneo,
  minimizarEscaneo,
  mostrarEscaneo,
  retomarAlVolver,
  useEscaneo,
  type Escaneo,
} from '@/components/escaner-store'
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
 * El comprobante que quedó trabajando de fondo.
 *
 * Es la prueba visible de que cerrar el modal no canceló nada: mientras esta
 * píldora esté ahí, la lectura sigue viva y se puede volver a ella de un
 * toque. La X es el único descarte de esta pantalla, y es explícito.
 */
function PildoraDeEscaneo({ escaneo }: { escaneo: Escaneo }) {
  const { t } = useTraduccion()

  const { Icono, texto, tono, gira } = {
    analizando: {
      Icono: Loader2,
      texto: t('escaner.leyendo'),
      tono: 'border-gold-leaf/30 text-gold-leaf',
      gira: true,
    },
    listo: {
      Icono: Check,
      texto: t('escaner.pildoraLista'),
      tono: 'border-income/40 text-income',
      gira: false,
    },
    error: {
      Icono: AlertTriangle,
      texto: t('escaner.errorLectura'),
      tono: 'border-expense/40 text-expense',
      gira: false,
    },
  }[escaneo.fase]

  return (
    <div
      className={`flex max-w-[16rem] items-center gap-1 rounded-xl border bg-menu py-1.5 pl-3 pr-1.5 shadow-2xl ${tono}`}
    >
      <button
        type="button"
        onClick={mostrarEscaneo}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-[11px] font-medium leading-snug"
      >
        <Icono className={`size-3.5 shrink-0 ${gira ? 'animate-spin' : ''}`} aria-hidden />
        <span className="min-w-0 flex-1">{texto}</span>
      </button>

      <button
        type="button"
        onClick={descartarEscaneo}
        aria-label={t('escaner.descartar')}
        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-subtle transition hover:bg-foreground/5"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
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
  const { t } = useTraduccion()

  const [abierto, setAbierto] = useState(false)
  const [cargaRapida, setCargaRapida] = useState(false)
  const [camara, setCamara] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputCamara = useRef<HTMLInputElement>(null)
  const inputArchivo = useRef<HTMLInputElement>(null)

  const solicitud = useAccionRapidaPendiente()

  /** El comprobante en curso vive en el store, no acá: sobrevive al modal. */
  const escaneo = useEscaneo()

  /**
   * La lectura terminó con la app en segundo plano y ya se avisó por
   * notificación: al volver, el comprobante se pone adelante solo.
   *
   * Va por `visibilitychange` y no por el click de la notificación porque el
   * usuario puede volver de muchas maneras —tocando el aviso, desde el
   * launcher, desde el conmutador de apps— y todas terminan acá.
   */
  useEffect(() => {
    function alVolver() {
      if (document.visibilityState === 'visible') retomarAlVolver()
    }

    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])

  /** El atajo "Nuevo Gasto" abre la hoja de carga rápida, ya con foco en el campo. */
  const mostrarCargaRapida = cargaRapida || solicitud?.accion === 'new-expense'

  /**
   * El atajo "Escanear" abre el visor propio derecho, sin toque de por medio:
   * `getUserMedia` pide PERMISO, no activación del usuario, así que funciona
   * hasta en el arranque en frío desde el launcher — que es justo donde el
   * `<input type="file">` se descartaba en silencio.
   *
   * Se DERIVA del store en vez de copiarse con un efecto por lo mismo que
   * `mostrarCargaRapida`: un `setState` dentro del efecto mete un render de
   * más y lo marca `react-hooks/set-state-in-effect`.
   *
   * `hayCamaraEnLaApp()` toca `navigator`, que en el servidor no existe: queda
   * detrás del `&&` a propósito. En el render de hidratación la solicitud
   * siempre es `null` —la emite un efecto de `<UrlActionHandler>`, que corre
   * después—, así que el corto circuito nunca la deja evaluarse en el momento
   * en que cliente y servidor tienen que coincidir.
   */
  const mostrarCamara = camara || (solicitud?.accion === 'scan-receipt' && hayCamaraEnLaApp())

  /**
   * El atajo "Escanear" llegó, no hay cámara propia y el `<input>` tampoco se
   * puede disparar solo: falta el toque del usuario. Se abre el dial con
   * "Tomar foto" resaltado —un toque, y la cámara sale—, que es preferible a
   * un atajo que aparenta no hacer nada.
   */
  const esperandoFoto =
    solicitud?.accion === 'scan-receipt' && !solicitud.puedeAbrirCamara && !mostrarCamara

  const dialAbierto = abierto || esperandoFoto

  /**
   * Único caso que necesita un efecto: disparar la cámara del sistema.
   *
   * Es un side effect sobre el DOM (click en un input oculto), no estado, y
   * los refs solo son seguros de leer fuera del render. Con visor propio no se
   * llega acá: lo abre `mostrarCamara`, derivado del render.
   */
  useEffect(() => {
    if (solicitud?.accion !== 'scan-receipt' || !solicitud.puedeAbrirCamara) return
    if (hayCamaraEnLaApp()) return

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

  /** Consume la solicitud además de bajar la bandera: si no, el atajo sigue
      latcheado y el visor se vuelve a abrir en el render siguiente. */
  function cerrarCamara() {
    setCamara(false)
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
    setAbierto(false)

    // La lectura arranca acá y no en el modal: así el modal puede cerrarse sin
    // llevársela puesta. El escáner solo necesita los NOMBRES de las
    // categorías —la lista de la que la IA elige— porque el tipo lo fija el
    // comprobante: siempre es un gasto.
    iniciarEscaneo(
      elegido,
      categorias.map((c) => c.nombre),
      t
    )
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
        {escaneo && !escaneo.enPantalla && <PildoraDeEscaneo escaneo={escaneo} />}

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
                setAbierto(false)

                // El visor propio es el camino normal; la cámara del sistema
                // queda para navegadores sin `getUserMedia`, donde no se puede
                // elegir el lente pero al menos se saca la foto.
                if (hayCamaraEnLaApp()) setCamara(true)
                else inputCamara.current?.click()
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

      {mostrarCamara && (
        <CameraCapture
          onCapturar={(foto) => {
            cerrarCamara()
            iniciarEscaneo(
              foto,
              categorias.map((c) => c.nombre),
              t
            )
          }}
          onCerrar={cerrarCamara}
          onCamaraDelSistema={() => {
            cerrarCamara()
            inputCamara.current?.click()
          }}
        />
      )}

      {/* Se monta mientras haya un escaneo, aunque esté minimizado: adentro se
          oculta con CSS. Desmontarlo perdería lo que el usuario ya corrigió a
          mano en el formulario. */}
      {escaneo && (
        <DocumentScannerModal
          escaneo={escaneo}
          categorias={categorias.map((c) => c.nombre)}
          cuentas={cuentas}
          onMinimizar={minimizarEscaneo}
          onDescartar={descartarEscaneo}
        />
      )}
    </>
  )
}
