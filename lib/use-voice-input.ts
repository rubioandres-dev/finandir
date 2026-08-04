'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

type Opciones = {
  /** Se llama con cada tramo cerrado, para ir llenando el campo en vivo. */
  onResultadoFinal: (texto: string) => void
  /**
   * Se llama una sola vez al terminar el dictado (el usuario hizo la pausa),
   * y solo si la sesión produjo texto. Sirve para disparar el análisis
   * automático sin repetirlo por cada tramo de una frase entrecortada.
   */
  onDictadoFinalizado?: () => void
  idioma?: string
}

/**
 * Estados reales del dictado.
 *
 *  inactivo    → nada corriendo
 *  verificando → prueba previa del micrófono (ver `medirEntrada`)
 *  iniciando   → pedimos permiso / esperamos que abra el dispositivo
 *  activo      → el motor captura, pero todavía no entró ningún sonido
 *  sonido      → entra audio (puede ser ruido ambiente)
 *  hablando    → el motor reconoce eso como voz
 */
export type EstadoVoz =
  | 'inactivo'
  | 'verificando'
  | 'iniciando'
  | 'activo'
  | 'sonido'
  | 'hablando'

export type PermisoMicrofono = 'granted' | 'denied' | 'prompt' | 'desconocido'

const MENSAJES: Record<string, string> = {
  'not-allowed':
    'Bloqueaste el micrófono. Habilitalo desde el candado en la barra de direcciones y recargá.',
  'service-not-allowed': 'El navegador bloqueó el reconocimiento de voz.',
  'no-speech':
    'Entró audio pero no llegué a reconocer palabras. Probá hablar un poco más fuerte, más cerca y sin cortes.',
  'audio-capture': 'No encontré ningún micrófono conectado.',
  network: 'El reconocimiento de voz necesita conexión a internet.',
  'language-not-supported': 'El navegador no soporta español para dictado.',
}

/** Milisegundos de silencio absoluto antes de sospechar del micrófono. */
const MS_HASTA_SOSPECHAR = 3500
/** Cuánto dura la prueba de micrófono previa al dictado. */
const MS_DE_PRUEBA = 700
/** Margen para que el sistema libere el dispositivo antes del reconocedor. */
const MS_DE_LIBERACION = 120
/** RMS por debajo del cual consideramos que no entró nada de audio. */
const RMS_MINIMO = 0.004
/** Cantidad de barras del medidor. */
export const NIVELES = 7

const sinCambios = () => () => {}
const hayApiDeVoz = () => Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition)
const enElServidor = () => false

type FalloDePrueba = 'denied' | 'sin-dispositivo' | 'falla'

/**
 * Prueba el micrófono ANTES de arrancar el reconocedor y devuelve el pico de
 * amplitud que midió.
 *
 * Es deliberadamente corta y libera el dispositivo al terminar. Mantener un
 * `getUserMedia` abierto en paralelo al reconocimiento es justamente lo que
 * hacía fallar el dictado: el medidor recibía audio (las barras se movían)
 * mientras el motor de voz se quedaba sin señal y cortaba con `no-speech`.
 * El dispositivo tiene un solo consumidor a la vez: primero la prueba,
 * después el reconocedor.
 */
async function medirEntrada(ms: number): Promise<{ pico: number; fallo: FalloDePrueba | null }> {
  let stream: MediaStream | null = null
  let ctx: AudioContext | null = null

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    ctx = new AudioContext()
    const analizador = ctx.createAnalyser()
    analizador.fftSize = 512
    ctx.createMediaStreamSource(stream).connect(analizador)

    const muestras = new Uint8Array(analizador.frequencyBinCount)
    let pico = 0
    const hasta = performance.now() + ms

    while (performance.now() < hasta) {
      analizador.getByteTimeDomainData(muestras)

      // RMS de la onda: 0 = silencio absoluto.
      let suma = 0
      for (const muestra of muestras) {
        const desviacion = (muestra - 128) / 128
        suma += desviacion * desviacion
      }
      pico = Math.max(pico, Math.sqrt(suma / muestras.length))

      await new Promise((listo) => setTimeout(listo, 40))
    }

    return { pico, fallo: null }
  } catch (excepcion) {
    const nombre = (excepcion as DOMException)?.name
    if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
      return { pico: 0, fallo: 'denied' }
    }
    if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') {
      return { pico: 0, fallo: 'sin-dispositivo' }
    }
    return { pico: 0, fallo: 'falla' }
  } finally {
    // Soltar el dispositivo antes de que arranque el reconocedor no es
    // opcional: si el stream sigue vivo, el motor de voz no escucha nada.
    if (stream) for (const pista of stream.getTracks()) pista.stop()
    if (ctx) await ctx.close().catch(() => {})
  }
}

export function useVoiceInput({
  onResultadoFinal,
  onDictadoFinalizado,
  idioma = 'es-AR',
}: Opciones) {
  const soportado = useSyncExternalStore(sinCambios, hayApiDeVoz, enElServidor)

  const [estado, setEstado] = useState<EstadoVoz>('inactivo')
  /** Fase de la animación de barras; `nivel` se deriva de esto y del estado. */
  const [pulso, setPulso] = useState(0)
  const [parcial, setParcial] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [permiso, setPermiso] = useState<PermisoMicrofono>('desconocido')
  const [sinSenal, setSinSenal] = useState(false)
  /** Pico medido en la última prueba previa; null si todavía no se probó. */
  const [picoDePrueba, setPicoDePrueba] = useState<number | null>(null)

  const reconocimientoRef = useRef<SpeechRecognition | null>(null)
  const relojSospechaRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onResultadoRef = useRef(onResultadoFinal)
  useEffect(() => {
    onResultadoRef.current = onResultadoFinal
  }, [onResultadoFinal])

  const onFinalizadoRef = useRef(onDictadoFinalizado)
  useEffect(() => {
    onFinalizadoRef.current = onDictadoFinalizado
  }, [onDictadoFinalizado])

  /** ¿Esta sesión de dictado produjo texto? Decide si auto-analizar al cerrar. */
  const huboTextoRef = useRef(false)
  /** Un stop() manual no dispara el análisis automático. */
  const cortadoAManoRef = useRef(false)
  /** Evita que un segundo clic entre en medio de la prueba de micrófono. */
  const verificandoRef = useRef(false)

  // Estado del permiso, cuando el navegador lo expone (Chrome/Edge sí,
  // Firefox y Safari todavía no soportan 'microphone' en Permissions API).
  useEffect(() => {
    let vivo = true
    let permisoStatus: PermissionStatus | null = null

    const consultar = async () => {
      try {
        permisoStatus = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        })
        if (!vivo) return
        setPermiso(permisoStatus.state)
        permisoStatus.onchange = () => setPermiso(permisoStatus!.state)
      } catch {
        // Navegador sin soporte: lo dejamos en 'desconocido'.
      }
    }
    consultar()

    return () => {
      vivo = false
      if (permisoStatus) permisoStatus.onchange = null
    }
  }, [])

  const limpiarRelojDeSospecha = useCallback(() => {
    if (relojSospechaRef.current) {
      clearTimeout(relojSospechaRef.current)
      relojSospechaRef.current = null
    }
  }, [])

  useEffect(() => {
    const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Constructor) return

    const reconocimiento = new Constructor()
    reconocimiento.lang = idioma
    reconocimiento.continuous = false
    reconocimiento.interimResults = true
    reconocimiento.maxAlternatives = 1

    reconocimiento.onstart = () => {
      setError(null)
      setParcial('')
      setEstado('iniciando')
      huboTextoRef.current = false
      cortadoAManoRef.current = false
      // `sinSenal` NO se limpia acá: lo decide la prueba previa, que ya sabe
      // si el dispositivo está entregando audio.
    }

    // El dispositivo abrió y está capturando.
    reconocimiento.onaudiostart = () => {
      setEstado('activo')
      setPermiso('granted')
      // Si en unos segundos no entró ni un sonido, algo anda mal con el mic.
      relojSospechaRef.current = setTimeout(() => setSinSenal(true), MS_HASTA_SOSPECHAR)
    }

    reconocimiento.onsoundstart = () => {
      setSinSenal(false)
      setEstado((previo) => (previo === 'hablando' ? previo : 'sonido'))
    }

    reconocimiento.onspeechstart = () => setEstado('hablando')
    reconocimiento.onspeechend = () =>
      setEstado((previo) => (previo === 'inactivo' ? previo : 'sonido'))
    reconocimiento.onsoundend = () =>
      setEstado((previo) => (previo === 'inactivo' ? previo : 'activo'))

    reconocimiento.onresult = (evento) => {
      let final = ''
      let provisorio = ''

      for (let i = evento.resultIndex; i < evento.results.length; i++) {
        const resultado = evento.results[i]
        if (resultado.isFinal) final += resultado[0].transcript
        else provisorio += resultado[0].transcript
      }

      setParcial(provisorio)
      if (final.trim()) {
        huboTextoRef.current = true
        onResultadoRef.current(final.trim())
        setParcial('')
      }
    }

    reconocimiento.onerror = (evento) => {
      // "aborted" lo dispara nuestro propio stop(): no es un error real.
      if (evento.error === 'aborted') return
      if (evento.error === 'not-allowed') setPermiso('denied')
      setError(MENSAJES[evento.error] ?? 'No se pudo usar el micrófono.')
      // Con error no analizamos: el texto puede haber quedado a medias.
      huboTextoRef.current = false
    }

    reconocimiento.onend = () => {
      setEstado('inactivo')
      setParcial('')
      setSinSenal(false)
      limpiarRelojDeSospecha()

      // Acá es donde el usuario "terminó de hablar y pausó": el motor cerró
      // la frase por sí solo. Solo entonces disparamos el análisis.
      if (huboTextoRef.current && !cortadoAManoRef.current) {
        onFinalizadoRef.current?.()
      }
      huboTextoRef.current = false
    }

    reconocimientoRef.current = reconocimiento

    return () => {
      reconocimiento.onstart = null
      reconocimiento.onaudiostart = null
      reconocimiento.onsoundstart = null
      reconocimiento.onspeechstart = null
      reconocimiento.onspeechend = null
      reconocimiento.onsoundend = null
      reconocimiento.onresult = null
      reconocimiento.onerror = null
      reconocimiento.onend = null
      reconocimiento.abort()
      reconocimientoRef.current = null
    }
  }, [idioma, limpiarRelojDeSospecha])

  const escuchando = estado !== 'inactivo'

  /**
   * Animación de las barras mientras se dicta.
   *
   * Durante el dictado el nivel ya no puede salir de un análisis de amplitud
   * propio (eso robaba el micrófono al reconocedor), así que refleja lo que
   * informa el motor: `sonido` = está entrando audio, `hablando` = eso lo
   * reconoce como voz. La verificación real del dispositivo es la prueba
   * previa, que expone `picoDePrueba`.
   */
  const hayEntrada = estado === 'sonido' || estado === 'hablando'
  const piso = estado === 'hablando' ? 3 : 1
  const techo = estado === 'hablando' ? NIVELES : 4

  useEffect(() => {
    if (!hayEntrada) return

    let actual = piso
    let subiendo = true

    const id = setInterval(() => {
      if (actual >= techo) subiendo = false
      if (actual <= piso) subiendo = true
      actual += subiendo ? 1 : -1
      setPulso(actual)
    }, 90)

    return () => clearInterval(id)
  }, [hayEntrada, piso, techo])

  // Derivado, no estado: fuera del dictado las barras están apagadas, y al
  // entrar en un estado nuevo el pulso viejo queda acotado a su rango.
  const nivel = hayEntrada ? Math.min(Math.max(pulso, piso), techo) : 0

  // Red de seguridad: no dejar el reloj colgado si el componente se desmonta.
  useEffect(() => limpiarRelojDeSospecha, [limpiarRelojDeSospecha])

  const alternar = useCallback(() => {
    const reconocimiento = reconocimientoRef.current
    if (!reconocimiento || verificandoRef.current) return

    if (escuchando) {
      // Frenar a mano deja el texto en el campo para revisarlo, sin analizar.
      cortadoAManoRef.current = true
      reconocimiento.stop()
      return
    }

    verificandoRef.current = true
    void (async () => {
      try {
        setError(null)
        setParcial('')
        setSinSenal(false)
        setEstado('verificando')

        const { pico, fallo } = await medirEntrada(MS_DE_PRUEBA)

        if (fallo === 'denied') {
          setPermiso('denied')
          setError(MENSAJES['not-allowed'])
          setEstado('inactivo')
          return
        }
        if (fallo === 'sin-dispositivo') {
          setError(MENSAJES['audio-capture'])
          setEstado('inactivo')
          return
        }

        if (!fallo) {
          setPermiso('granted')
          setPicoDePrueba(pico)
          // Si el dispositivo no entregó nada en la prueba, avisamos ya: el
          // reconocedor tampoco va a escuchar nada.
          setSinSenal(pico < RMS_MINIMO)
        }

        // El cierre del stream no es instantáneo en el sistema operativo;
        // arrancar el reconocedor encima de un dispositivo que todavía se
        // está liberando es volver al problema que esto viene a resolver.
        await new Promise((listo) => setTimeout(listo, MS_DE_LIBERACION))

        try {
          reconocimiento.start()
        } catch {
          // start() tira InvalidStateError si ya venía corriendo.
          setEstado('inactivo')
        }
      } finally {
        verificandoRef.current = false
      }
    })()
  }, [escuchando])

  return {
    soportado,
    escuchando,
    estado,
    nivel,
    parcial,
    error,
    permiso,
    sinSenal,
    picoDePrueba,
    alternar,
  }
}
