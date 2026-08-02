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
 * Estados reales del dictado. La diferencia entre ellos es justamente lo que
 * permite validar el micrófono:
 *
 *  inactivo   → nada corriendo
 *  iniciando  → pedimos permiso / esperamos que abra el dispositivo
 *  activo     → el micrófono captura, pero todavía no entró ningún sonido
 *  sonido     → entra audio (puede ser ruido ambiente)
 *  hablando   → el motor reconoce eso como voz
 */
export type EstadoVoz = 'inactivo' | 'iniciando' | 'activo' | 'sonido' | 'hablando'

export type PermisoMicrofono = 'granted' | 'denied' | 'prompt' | 'desconocido'

const MENSAJES: Record<string, string> = {
  'not-allowed':
    'Bloqueaste el micrófono. Habilitalo desde el candado en la barra de direcciones y recargá.',
  'service-not-allowed': 'El navegador bloqueó el reconocimiento de voz.',
  'no-speech': 'No detecté ninguna voz. Probá hablar más cerca del micrófono.',
  'audio-capture': 'No encontré ningún micrófono conectado.',
  network: 'El reconocimiento de voz necesita conexión a internet.',
  'language-not-supported': 'El navegador no soporta español para dictado.',
}

/** Milisegundos de silencio absoluto antes de sospechar del micrófono. */
const MS_HASTA_SOSPECHAR = 3500
/** Cantidad de barras del medidor. */
export const NIVELES = 7

const sinCambios = () => () => {}
const hayApiDeVoz = () => Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition)
const enElServidor = () => false

export function useVoiceInput({
  onResultadoFinal,
  onDictadoFinalizado,
  idioma = 'es-AR',
}: Opciones) {
  const soportado = useSyncExternalStore(sinCambios, hayApiDeVoz, enElServidor)

  const [estado, setEstado] = useState<EstadoVoz>('inactivo')
  const [nivel, setNivel] = useState(0)
  const [parcial, setParcial] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [permiso, setPermiso] = useState<PermisoMicrofono>('desconocido')
  const [sinSenal, setSinSenal] = useState(false)

  const reconocimientoRef = useRef<SpeechRecognition | null>(null)
  const medidorRef = useRef<{ stream: MediaStream; ctx: AudioContext; raf: number } | null>(null)
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

  /** Corta el medidor de volumen y libera el micrófono. */
  const detenerMedidor = useCallback(() => {
    const medidor = medidorRef.current
    if (!medidor) return
    cancelAnimationFrame(medidor.raf)
    for (const pista of medidor.stream.getTracks()) pista.stop()
    void medidor.ctx.close()
    medidorRef.current = null
    setNivel(0)
  }, [])

  /**
   * Abre un stream propio y mide la amplitud real de entrada. Es la única
   * forma de distinguir "la API arrancó" de "el micrófono está capturando".
   */
  const iniciarMedidor = useCallback(async () => {
    if (medidorRef.current) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      const analizador = ctx.createAnalyser()
      analizador.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analizador)

      const muestras = new Uint8Array(analizador.frequencyBinCount)
      let ultimoBucket = -1

      const medir = () => {
        analizador.getByteTimeDomainData(muestras)

        // RMS de la onda: 0 = silencio absoluto.
        let suma = 0
        for (const muestra of muestras) {
          const desviacion = (muestra - 128) / 128
          suma += desviacion * desviacion
        }
        const rms = Math.sqrt(suma / muestras.length)
        const bucket = Math.min(NIVELES, Math.round(rms * 45))

        // Solo re-renderizamos cuando cambia de escalón, no en cada frame.
        if (bucket !== ultimoBucket) {
          ultimoBucket = bucket
          setNivel(bucket)
          if (bucket > 0) setSinSenal(false)
        }

        if (medidorRef.current) {
          medidorRef.current.raf = requestAnimationFrame(medir)
        }
      }

      medidorRef.current = { stream, ctx, raf: requestAnimationFrame(medir) }
    } catch {
      // Si falla no rompemos el dictado: solo perdemos el medidor visual.
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
      setSinSenal(false)
      setEstado('iniciando')
      huboTextoRef.current = false
      cortadoAManoRef.current = false
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
    reconocimiento.onspeechend = () => setEstado((previo) => (previo === 'inactivo' ? previo : 'sonido'))
    reconocimiento.onsoundend = () => setEstado((previo) => (previo === 'inactivo' ? previo : 'activo'))

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
  }, [idioma])

  const escuchando = estado !== 'inactivo'

  // El medidor y el reloj de sospecha siguen al estado del reconocimiento.
  useEffect(() => {
    if (escuchando) {
      void iniciarMedidor()
      return
    }
    detenerMedidor()
    if (relojSospechaRef.current) {
      clearTimeout(relojSospechaRef.current)
      relojSospechaRef.current = null
    }
  }, [escuchando, iniciarMedidor, detenerMedidor])

  // Red de seguridad: liberar el micrófono si el componente se desmonta.
  useEffect(() => detenerMedidor, [detenerMedidor])

  const alternar = useCallback(() => {
    const reconocimiento = reconocimientoRef.current
    if (!reconocimiento) return

    if (escuchando) {
      // Frenar a mano deja el texto en el campo para revisarlo, sin analizar.
      cortadoAManoRef.current = true
      reconocimiento.stop()
      return
    }

    try {
      reconocimiento.start()
    } catch {
      // start() tira InvalidStateError si ya venía corriendo; lo ignoramos.
    }
  }, [escuchando])

  return { soportado, escuchando, estado, nivel, parcial, error, permiso, sinSenal, alternar }
}
