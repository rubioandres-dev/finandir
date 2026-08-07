'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from 'lucide-react'
import { useTraduccion } from '@/components/currency-provider'
import type { Clave } from '@/lib/i18n'

/**
 * Recorrido guiado sobre el Home.
 *
 * POR QUÉ NO Driver.js NI Joyride
 *
 * Las dos resuelven el 90 % del problema y traen el 100 % de su CSS. Joyride
 * pesa ~40 kB y arrastra react-floater; Driver.js inyecta su propia hoja de
 * estilos con colores, radios y sombras que no son los de AUREM, así que hay
 * que sobrescribirla clase por clase. Lo que hace falta acá —un recorte, una
 * tarjeta y cuatro pasos— son las 200 líneas de abajo, y quedan del lado del
 * sistema de diseño en vez de peleadas con él.
 *
 * CÓMO SE RECORTA LA PANTALLA
 *
 * No hay máscara ni SVG: es un `<div>` posicionado sobre el elemento con un
 * `box-shadow` de radio 0 y spread enorme. La sombra pinta TODO menos el rectángulo
 * del div, que queda transparente. Es una sola capa, sin recalcular geometría
 * de agujeros, y hereda `border-radius` gratis.
 *
 * PASOS QUE NO ENCUENTRAN SU ANCLA
 *
 * El tour corre sobre el Home, pero un módulo apagado o una pantalla angosta
 * pueden dejar sin renderizar el elemento de un paso. En vez de saltearlo o
 * romperse, el paso se muestra CENTRADO y sin recorte: el texto sigue teniendo
 * sentido aunque no haya nada que señalar.
 */

const CLAVE_ALMACENADA = 'aurem:tour-visto'

type Paso = {
  /** Valor de `data-tour` del elemento a destacar. */
  ancla: string
  titulo: Clave
  cuerpo: Clave
}

/**
 * Los recorridos disponibles.
 *
 * Es un mapa y no una lista suelta porque cada módulo explica lo suyo sobre sus
 * propios elementos. El de inicio es el que arranca solo en la primera visita;
 * el de inversiones lo dispara el "?" de esa página. Comparten toda la
 * mecánica —recorte, tarjeta, teclado— y sólo cambian los pasos: una segunda
 * implementación de spotlight sería el mismo código dos veces, con las dos
 * divergiendo al primer retoque.
 */
export type Recorrido = 'inicio' | 'inversiones'

const RECORRIDOS: Record<Recorrido, { titulo: Clave; pasos: Paso[] }> = {
  inicio: {
    titulo: 'tour.titulo',
    pasos: [
      { ancla: 'balance', titulo: 'tour.balanceTitulo', cuerpo: 'tour.balanceCuerpo' },
      { ancla: 'smart-input', titulo: 'tour.entradaTitulo', cuerpo: 'tour.entradaCuerpo' },
      { ancla: 'smart-spend', titulo: 'tour.gastoTitulo', cuerpo: 'tour.gastoCuerpo' },
      { ancla: 'inversiones', titulo: 'tour.inversionesTitulo', cuerpo: 'tour.inversionesCuerpo' },
    ],
  },
  inversiones: {
    titulo: 'tour.invTitulo',
    pasos: [
      { ancla: 'inv-total', titulo: 'tour.invLiquidezTitulo', cuerpo: 'tour.invLiquidezCuerpo' },
      { ancla: 'inv-tna', titulo: 'tour.invTnaTitulo', cuerpo: 'tour.invTnaCuerpo' },
      { ancla: 'inv-pasiva', titulo: 'tour.invPasivaTitulo', cuerpo: 'tour.invPasivaCuerpo' },
    ],
  },
}

type Contexto = {
  abrirTour: (recorrido?: Recorrido) => void
  /** true una vez que el navegador confirmó que el tour ya se vio. */
  yaVisto: boolean
}

const TourContext = createContext<Contexto | null>(null)

export function useTour(): Contexto {
  const contexto = useContext(TourContext)
  if (!contexto) throw new Error('useTour debe usarse dentro de <GuidedTourProvider>')
  return contexto
}

/** Sin suscripción: el valor no cambia después de hidratar. */
const SIN_CAMBIOS = () => () => {}

/**
 * `false` en el render del servidor, el valor real después de hidratar.
 *
 * `localStorage` no existe en el servidor, así que leerlo directo daría un
 * mismatch de hidratación. Mismo patrón que `useHidratado` en `profile-menu`.
 */
function useYaVisto(): boolean {
  return useSyncExternalStore(
    SIN_CAMBIOS,
    () => {
      try {
        return window.localStorage.getItem(CLAVE_ALMACENADA) === '1'
      } catch {
        // Safari en privado tira al leer. Se asume visto: es preferible no
        // mostrar el tour a mostrarlo en cada carga sin poder apagarlo.
        return true
      }
    },
    () => true
  )
}

type Recorte = { top: number; left: number; width: number; height: number } | null

export function GuidedTourProvider({
  /** true cuando el usuario recién se registró: arranca solo. */
  arrancarSolo = false,
  children,
}: {
  arrancarSolo?: boolean
  children: React.ReactNode
}) {
  const yaVisto = useYaVisto()
  const [activo, setActivo] = useState(false)
  const [recorrido, setRecorrido] = useState<Recorrido>('inicio')
  const [paso, setPaso] = useState(0)
  const [recorte, setRecorte] = useState<Recorte>(null)

  const abrirTour = useCallback((cual: Recorrido = 'inicio') => {
    setRecorrido(cual)
    setPaso(0)
    setActivo(true)
  }, [])

  const pasos = RECORRIDOS[recorrido].pasos

  const cerrar = useCallback(() => {
    setActivo(false)
    setRecorte(null)
    try {
      window.localStorage.setItem(CLAVE_ALMACENADA, '1')
    } catch {
      // Sin almacenamiento el tour vuelve a aparecer en la próxima visita.
      // Molesto, pero no roto: se cierra igual.
    }
  }, [])

  // Arranque automático la primera vez. Va en un efecto porque depende de
  // `localStorage`, que sólo existe después de hidratar.
  useEffect(() => {
    if (!arrancarSolo || yaVisto) return
    const id = window.setTimeout(() => setActivo(true), 600)
    return () => window.clearTimeout(id)
  }, [arrancarSolo, yaVisto])

  // Mide el ancla del paso actual y la sigue si la ventana cambia de tamaño.
  useEffect(() => {
    if (!activo) return

    function medir() {
      const objetivo = document.querySelector<HTMLElement>(
        `[data-tour="${RECORRIDOS[recorrido].pasos[paso].ancla}"]`
      )

      if (!objetivo) {
        setRecorte(null)
        return
      }

      objetivo.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // Después del scroll suave: medir antes daría la posición vieja.
      window.setTimeout(() => {
        const caja = objetivo.getBoundingClientRect()
        setRecorte({
          top: caja.top - 8,
          left: caja.left - 8,
          width: caja.width + 16,
          height: caja.height + 16,
        })
      }, 320)
    }

    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [activo, paso, recorrido])

  // Escape cierra, y el fondo no scrollea mientras el tour está abierto.
  useEffect(() => {
    if (!activo) return

    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === 'Escape') cerrar()
    }

    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [activo, cerrar])

  const contexto = useMemo<Contexto>(() => ({ abrirTour, yaVisto }), [abrirTour, yaVisto])

  return (
    <TourContext.Provider value={contexto}>
      {children}
      {activo && (
        <CapaDelTour
          recorrido={recorrido}
          paso={paso}
          recorte={recorte}
          onAnterior={() => setPaso((p) => Math.max(0, p - 1))}
          onSiguiente={() => {
            if (paso >= pasos.length - 1) cerrar()
            else setPaso((p) => p + 1)
          }}
          onCerrar={cerrar}
        />
      )}
    </TourContext.Provider>
  )
}

function CapaDelTour({
  recorrido,
  paso,
  recorte,
  onAnterior,
  onSiguiente,
  onCerrar,
}: {
  recorrido: Recorrido
  paso: number
  recorte: Recorte
  onAnterior: () => void
  onSiguiente: () => void
  onCerrar: () => void
}) {
  const { t } = useTraduccion()
  const { titulo, pasos } = RECORRIDOS[recorrido]
  const actual = pasos[paso]
  const ultimo = paso === pasos.length - 1

  if (typeof document === 'undefined') return null

  /**
   * Dónde va la tarjeta.
   *
   * Debajo del recorte si hay lugar; si no, encima. Sin ancla, centrada. El
   * cálculo es en píxeles y no en clases porque depende de la medición.
   */
  const alto = typeof window === 'undefined' ? 0 : window.innerHeight
  const debajo = recorte !== null && recorte.top + recorte.height + 200 < alto
  const estiloTarjeta: React.CSSProperties = recorte
    ? debajo
      ? { top: recorte.top + recorte.height + 12, left: 16, right: 16 }
      : { bottom: alto - recorte.top + 12, left: 16, right: 16 }
    : { top: '50%', left: 16, right: 16, transform: 'translateY(-50%)' }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(titulo)}
      className="fixed inset-0 z-[90]"
    >
      {/* El recorte. `box-shadow` gigante pinta todo menos este rectángulo. */}
      {recorte ? (
        <div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-gold-leaf transition-all duration-300"
          style={{
            top: recorte.top,
            left: recorte.left,
            width: recorte.width,
            height: recorte.height,
            boxShadow: '0 0 0 9999px rgba(10, 12, 20, 0.82)',
          }}
          aria-hidden
        />
      ) : (
        <div className="absolute inset-0 bg-midnight-navy/85" aria-hidden />
      )}

      {/* Capta los clicks fuera de la tarjeta para cerrar. Va debajo de ella
          en el DOM para no tapar sus botones. */}
      <button
        type="button"
        aria-label={t('comun.cerrar')}
        onClick={onCerrar}
        className="absolute inset-0 cursor-default"
      />

      <div
        style={estiloTarjeta}
        className="absolute mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-gold-leaf bg-menu p-4 shadow-2xl shadow-midnight-navy/70"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="aurem-caps flex items-center gap-1.5 text-[10px] text-gold-leaf">
            <Sparkles className="size-3.5" aria-hidden />
            {t(titulo)}
          </p>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={t('tour.saltar')}
            className="-mr-1 -mt-1 grid size-7 cursor-pointer place-items-center rounded-lg text-subtle transition hover:bg-foreground/5 hover:text-gold-leaf"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <h3 className="font-display text-base font-bold tracking-tight text-on-background">
            {t(actual.titulo)}
          </h3>
          <p className="text-xs leading-relaxed text-on-surface-variant">{t(actual.cuerpo)}</p>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          {/* Puntos de avance: dicen cuánto falta sin ocupar una línea de texto. */}
          <ul className="flex items-center gap-1.5" aria-hidden>
            {pasos.map((p, indice) => (
              <li
                key={p.ancla}
                className={`h-1.5 rounded-full transition-all ${
                  indice === paso ? 'w-4 bg-gold-leaf' : 'w-1.5 bg-gold-leaf/25'
                }`}
              />
            ))}
          </ul>

          <div className="flex shrink-0 items-center gap-2">
            {paso > 0 && (
              <button
                type="button"
                onClick={onAnterior}
                className="flex cursor-pointer items-center gap-1 rounded-xl border border-glass-stroke/60 px-2.5 py-2 text-[11px] font-medium text-on-surface-variant transition hover:border-gold-leaf/60 hover:text-gold-leaf"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                {t('tour.anterior')}
              </button>
            )}

            <button
              type="button"
              onClick={onSiguiente}
              className="btn-gold flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-2 font-display text-[11px] font-bold uppercase tracking-wider"
            >
              {ultimo ? (
                <>
                  <Check className="size-3.5" aria-hidden />
                  {t('tour.terminar')}
                </>
              ) : (
                <>
                  {t('tour.siguiente')}
                  <ArrowRight className="size-3.5" aria-hidden />
                </>
              )}
            </button>
          </div>
        </div>

        <p className="text-[10px] text-subtle">
          {t('tour.contador', { actual: paso + 1, total: pasos.length })}
        </p>
      </div>
    </div>,
    document.body
  )
}
