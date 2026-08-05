'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'

export type ModoDeEjecucion = 'instalada' | 'navegador'

/**
 * Los `display-mode` que cuentan como "corriendo como app".
 *
 * `standalone` es el del manifest de Finandir; los otros tres se incluyen
 * porque un mismo manifest puede abrirse en otro modo según la plataforma
 * (`window-controls-overlay` es el de las PWA de escritorio con barra de
 * título propia) y en todos esos casos no hay UI de navegador a la vista.
 */
const MODOS_DE_APP = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'] as const

/**
 * Cómo se sabe si la PWA corre instalada o desde el navegador.
 *
 * No hay una sola señal que sirva en todas las plataformas, así que se
 * consultan tres, de la más estándar a la más específica:
 *
 * 1. `(display-mode: …)` — la media query del estándar, y la buena: la
 *    responde el navegador según cómo abrió la ventana, no según lo que
 *    declara el manifest.
 * 2. `navigator.standalone` — extensión de Safari en iOS. Hace falta porque
 *    iOS recién soporta `display-mode` desde 16.4.
 * 3. `document.referrer` con `android-app://` — cuando Android lanza el
 *    WebAPK el referrer delata el origen. Red de seguridad por si la ventana
 *    quedó en modo navegador pero el lanzamiento vino de la app instalada.
 */
function detectarModo(): ModoDeEjecucion {
  if (MODOS_DE_APP.some((modo) => window.matchMedia(`(display-mode: ${modo})`).matches)) {
    return 'instalada'
  }
  if (navigator.standalone) return 'instalada'
  if (document.referrer.startsWith('android-app://')) return 'instalada'
  return 'navegador'
}

/** iOS no implementa `beforeinstallprompt`: ahí la instalación es manual. */
function detectarIos(): boolean {
  const ua = navigator.userAgent
  // El iPad con iPadOS se presenta como Macintosh; lo distingue el táctil.
  // Chrome y Firefox en iOS son WebKit por dentro y tampoco pueden instalar.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document)
}

type Estado = {
  modo: ModoDeEjecucion | null
  sePuedeInstalar: boolean
  esIos: boolean
}

/**
 * En el servidor no hay forma de saber nada de esto. `modo: null` es lo que
 * ve el render de hidratación, y por eso la UI muestra un placeholder en vez
 * de arriesgar un valor que después parpadearía.
 */
const ESTADO_DEL_SERVIDOR: Estado = { modo: null, sePuedeInstalar: false, esIos: false }

/**
 * Store externo, no estado de React, por dos razones:
 *
 * `beforeinstallprompt` puede dispararse antes de que React hidrate y el
 * navegador lo emite una sola vez, así que se escucha al evaluarse el módulo
 * —antes de que monte cualquier componente— y no dentro de un efecto, que
 * llegaría tarde y perdería el evento.
 *
 * Y `useSyncExternalStore` es el primitivo pensado para leer algo que vive
 * fuera de React: resuelve la hidratación con `getServerSnapshot` sin
 * necesidad de un flag `montado` ni de un `setState` dentro de un efecto.
 */
let promptGuardado: BeforeInstallPromptEvent | null = null
let estadoActual: Estado = ESTADO_DEL_SERVIDOR
const suscriptores = new Set<() => void>()

function calcular(): Estado {
  return {
    modo: detectarModo(),
    sePuedeInstalar: promptGuardado !== null,
    esIos: detectarIos(),
  }
}

/**
 * Recalcula y avisa solo si algo cambió.
 *
 * La comparación campo por campo no es una optimización: `getSnapshot` tiene
 * que devolver la MISMA referencia mientras el valor no cambie, o
 * `useSyncExternalStore` entra en un loop de renders.
 */
function refrescar() {
  const nuevo = calcular()
  if (
    estadoActual.modo === nuevo.modo &&
    estadoActual.sePuedeInstalar === nuevo.sePuedeInstalar &&
    estadoActual.esIos === nuevo.esIos
  ) {
    return
  }
  estadoActual = nuevo
  for (const avisar of suscriptores) avisar()
}

if (typeof window !== 'undefined') {
  estadoActual = calcular()

  window.addEventListener('beforeinstallprompt', (evento) => {
    // Sin esto Chrome muestra su propio mini-infobar y nos saca el control.
    evento.preventDefault()
    promptGuardado = evento
    refrescar()
  })

  window.addEventListener('appinstalled', () => {
    // El evento ya no sirve para nada: la app está instalada.
    promptGuardado = null
    refrescar()
  })

  // El modo puede cambiar en vivo: instalar y abrir desde el launcher, o
  // pasar de ventana a pestaña en escritorio.
  for (const modo of MODOS_DE_APP) {
    window.matchMedia(`(display-mode: ${modo})`).addEventListener('change', refrescar)
  }
}

function suscribir(alCambiar: () => void) {
  suscriptores.add(alCambiar)
  return () => suscriptores.delete(alCambiar)
}

export type EstadoDeInstalacion = {
  /** `null` mientras hidrata; después, siempre uno de los dos. */
  modo: ModoDeEjecucion | null
  /** Hay un prompt nativo listo para disparar. */
  sePuedeInstalar: boolean
  /** iOS: hay que explicar los pasos porque no existe el prompt. */
  necesitaPasosManuales: boolean
  instalando: boolean
  /** Abre el diálogo nativo y devuelve qué eligió el usuario. */
  instalar: () => Promise<'accepted' | 'dismissed' | 'sin-prompt'>
}

export function usePwaInstall(): EstadoDeInstalacion {
  const estado = useSyncExternalStore(suscribir, () => estadoActual, () => ESTADO_DEL_SERVIDOR)
  const [instalando, setInstalando] = useState(false)

  const instalar = useCallback(async () => {
    const evento = promptGuardado
    if (!evento) return 'sin-prompt' as const

    setInstalando(true)
    try {
      await evento.prompt()
      const { outcome } = await evento.userChoice
      // El evento se consume al usarlo; el navegador emitirá uno nuevo si
      // todavía se puede instalar.
      promptGuardado = null
      refrescar()
      return outcome
    } finally {
      setInstalando(false)
    }
  }, [])

  return {
    modo: estado.modo,
    sePuedeInstalar: estado.sePuedeInstalar,
    necesitaPasosManuales: estado.esIos && estado.modo === 'navegador',
    instalando,
    instalar,
  }
}
