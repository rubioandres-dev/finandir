'use client'

import Link from 'next/link'
import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { useFormStatus } from 'react-dom'
import {
  Coins,
  Download,
  Globe,
  Compass,
  FileSpreadsheet,
  Info,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Share,
  Smartphone,
  Sun,
  UserCog,
} from 'lucide-react'
import { cerrarSesion } from '@/app/(auth)/actions'
import { AboutModal } from '@/components/about-modal'
import { useTraduccion } from '@/components/currency-provider'
import { useTour } from '@/components/guided-tour'
import { FloatingPanel } from '@/components/layout/floating-panel'
import { usePwaInstall } from '@/lib/use-pwa-install'

const TEMAS = [
  { valor: 'light', etiqueta: 'Claro', Icono: Sun },
  { valor: 'dark', etiqueta: 'Oscuro', Icono: Moon },
  { valor: 'system', etiqueta: 'Sistema', Icono: Monitor },
] as const

/** Iniciales para el avatar: "arubio@…" -> "AR". */
export function inicialesDe(texto: string): string {
  const base = texto.includes('@') ? (texto.split('@')[0] ?? '') : texto
  const partes = base.split(/[\s._-]+/).filter(Boolean)
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase()
  return base.slice(0, 2).toUpperCase() || 'AU'
}

const FILA =
  'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium transition hover:bg-gold-leaf/[0.07] disabled:opacity-50'

/**
 * Descarga del libro en Excel.
 *
 * POR QUÉ `fetch` + Blob Y NO UN `<a href>` PELADO
 *
 * Un enlace directo funcionaría, pero el archivo tarda: hay que leer cuentas,
 * inversiones, movimientos del año y las cotizaciones antes de armarlo. Con un
 * `<a>` no hay forma de saber que empezó ni de mostrar el spinner, y el usuario
 * toca tres veces creyendo que no pasó nada. Con `fetch` se sabe cuándo termina
 * y recién ahí se dispara la descarga con un enlace efímero.
 */
function BotonExcel() {
  const { t } = useTraduccion()
  const [bajando, setBajando] = useState(false)
  const [error, setError] = useState(false)

  async function descargar() {
    if (bajando) return
    setBajando(true)
    setError(false)

    try {
      const respuesta = await fetch('/api/export/excel')
      if (!respuesta.ok) throw new Error(String(respuesta.status))

      const blob = await respuesta.blob()
      const url = URL.createObjectURL(blob)

      // El nombre lo manda el servidor en Content-Disposition, pero el atributo
      // `download` de un blob: no lo lee: hay que repetirlo acá.
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = respuesta.headers
        .get('Content-Disposition')
        ?.match(/filename="(.+)"/)?.[1] ?? 'aurem.xlsx'
      document.body.appendChild(enlace)
      enlace.click()
      enlace.remove()

      // Sin esto el blob queda retenido hasta que se recargue la página.
      URL.revokeObjectURL(url)
    } catch {
      setError(true)
    } finally {
      setBajando(false)
    }
  }

  return (
    <button
      type="button"
      onClick={descargar}
      disabled={bajando}
      className={`${FILA} text-on-surface-variant`}
    >
      {bajando ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-gold-leaf" aria-hidden />
      ) : (
        <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate">
        {bajando ? t('excel.generando') : error ? t('excel.error') : t('excel.descargar')}
      </span>
    </button>
  )
}

function BotonSalir() {
  const { pending } = useFormStatus()

  return (
    <button type="submit" disabled={pending} className={`${FILA} text-on-surface-variant`}>
      <LogOut className="size-4 shrink-0" aria-hidden />
      {pending ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  )
}

/** Chip que dice si la app corre instalada o desde el navegador. */
function IndicadorDeModo() {
  const { modo } = usePwaInstall()

  // Antes de montar no se puede saber: mostrar cualquiera de los dos daría un
  // parpadeo al hidratar.
  if (modo === null) {
    return <span className="mt-1 block h-4 w-24 animate-pulse rounded-full bg-gold-leaf/10" />
  }

  const instalada = modo === 'instalada'
  const Icono = instalada ? Smartphone : Globe

  return (
    <span
      className={`mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        instalada
          ? 'bg-income/10 text-income'
          : 'border border-glass-stroke/50 text-on-surface-variant/80'
      }`}
    >
      <Icono className="size-3" aria-hidden />
      {instalada ? 'Instalada como app' : 'En el navegador'}
    </span>
  )
}

/**
 * Bloque de instalación. Tiene tres formas según lo que ofrezca la plataforma,
 * y no aparece si ya está instalada.
 */
function Instalacion({ alCerrar }: { alCerrar: () => void }) {
  const { modo, sePuedeInstalar, necesitaPasosManuales, instalando, instalar } = usePwaInstall()
  const [pasosVisibles, setPasosVisibles] = useState(false)

  if (modo !== 'navegador') return null

  if (sePuedeInstalar) {
    return (
      <button
        type="button"
        disabled={instalando}
        onClick={async () => {
          const resultado = await instalar()
          // Si aceptó, el panel ya no tiene nada que ofrecer.
          if (resultado === 'accepted') alCerrar()
        }}
        className={`${FILA} text-gold-leaf`}
      >
        <Download className="size-4 shrink-0" aria-hidden />
        {instalando ? 'Instalando…' : 'Descargar al dispositivo'}
      </button>
    )
  }

  if (necesitaPasosManuales) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setPasosVisibles((previo) => !previo)}
          aria-expanded={pasosVisibles}
          className={`${FILA} text-gold-leaf`}
        >
          <Share className="size-4 shrink-0" aria-hidden />
          Agregar a la pantalla de inicio
        </button>
        {pasosVisibles && (
          <p className="px-2.5 pb-2 text-[11px] leading-relaxed text-subtle">
            En iOS la instalación es manual: tocá <strong>Compartir</strong> en la barra de Safari
            y elegí <strong>Agregar a inicio</strong>.
          </p>
        )}
      </div>
    )
  }

  // Firefox de escritorio, por ejemplo: no hay prompt ni pasos que indicar.
  return (
    <p className="px-2.5 py-2 text-[11px] leading-relaxed text-subtle">
      Este navegador no ofrece instalar la app. Probá con Chrome o Edge.
    </p>
  )
}

/** Sin suscripción: el valor no cambia después de hidratar. */
const SIN_CAMBIOS = () => () => {}

/**
 * `false` en el render de hidratación, `true` después.
 *
 * next-themes no conoce el tema elegido en el servidor, así que marcar el
 * botón activo en el primer render daría un mismatch. Se resuelve con
 * `useSyncExternalStore`, cuyo `getServerSnapshot` devuelve false, en vez de
 * un `setState` dentro de un efecto.
 */
function useHidratado(): boolean {
  return useSyncExternalStore(
    SIN_CAMBIOS,
    () => true,
    () => false
  )
}

function SelectorDeTema() {
  const { theme, setTheme } = useTheme()
  const hidratado = useHidratado()

  return (
    <div className="px-2.5 py-1.5">
      <p className="aurem-caps pb-1.5 text-[10px] text-gold-leaf/70">Tema</p>
      <div
        role="radiogroup"
        aria-label="Tema de la aplicación"
        className="flex gap-1 rounded-xl border border-glass-stroke/40 p-0.5"
      >
        {TEMAS.map(({ valor, etiqueta, Icono }) => {
          const activo = hidratado && theme === valor

          return (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => setTheme(valor)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-medium transition ${
                activo
                  ? 'bg-gold-leaf/10 text-gold-leaf'
                  : 'text-on-surface-variant hover:bg-gold-leaf/[0.07]'
              }`}
            >
              <Icono className="size-4" aria-hidden />
              {etiqueta}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ProfileMenu({ email, nombre }: { email: string; nombre: string | null }) {
  const [abierto, setAbierto] = useState(false)
  const [acercaDeAbierto, setAcercaDeAbierto] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const cerrar = useCallback(() => setAbierto(false), [])
  const { t } = useTraduccion()
  const { abrirTour } = useTour()

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((previo) => !previo)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={`Perfil de ${nombre ?? email}`}
        className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-gold-leaf bg-surface-container font-display text-[11px] font-bold tracking-tight text-gold-leaf transition active:scale-90 hover:brightness-110"
      >
        {inicialesDe(nombre ?? email)}
      </button>

      {abierto && (
        <FloatingPanel
          ancla={boton}
          onCerrar={cerrar}
          ancho="w-64"
          rol="menu"
          etiqueta="Perfil y ajustes"
        >
          <div className="flex flex-col px-2.5 py-2">
            {nombre && (
              <span className="truncate text-xs font-semibold text-on-background">{nombre}</span>
            )}
            <span className="truncate text-[11px] text-subtle">{email}</span>
            <IndicadorDeModo />
          </div>

          <div className="my-1 h-px bg-glass-stroke/40" />

          <Instalacion alCerrar={cerrar} />

          <div className="my-1 h-px bg-glass-stroke/40" />

          <SelectorDeTema />

          <div className="my-1 h-px bg-glass-stroke/40" />

          <Link
            href="/dashboard/settings#perfil"
            onClick={cerrar}
            className={`${FILA} text-on-surface-variant`}
          >
            <UserCog className="size-4 shrink-0" aria-hidden />
            Ajustes y perfil
          </Link>

          {/* Objetivos y Tier salieron de acá: este menú es de CUENTA —quién
              sos, cómo se ve la app, cómo salir— y el XP es una sección de la
              app como cualquier otra. Vive en la barra lateral (escritorio) y
              en la bandeja "Más" (mobile), donde está el resto de los módulos. */}

          <Link
            href="/dashboard/settings#divisas"
            onClick={cerrar}
            className={`${FILA} text-on-surface-variant`}
          >
            <Coins className="size-4 shrink-0" aria-hidden />
            Preferencias de moneda
          </Link>

          {/* El tour arranca desde el Home: si estamos en otra sección, sus
              anclas no existen y los pasos caen al modo centrado. Es aceptable
              —el texto se entiende igual— y evita una navegación forzada. */}
          {/* No cierra el panel: el spinner es la única señal de que el
              archivo se está armando, y cerrarlo la escondería. */}
          <BotonExcel />

          <button
            type="button"
            onClick={() => {
              cerrar()
              abrirTour()
            }}
            className={`${FILA} text-on-surface-variant`}
          >
            <Compass className="size-4 shrink-0" aria-hidden />
            {t('tour.abrir')}
          </button>

          <button
            type="button"
            onClick={() => {
              cerrar()
              setAcercaDeAbierto(true)
            }}
            className={`${FILA} text-on-surface-variant`}
          >
            <Info className="size-4 shrink-0" aria-hidden />
            Acerca de AUREM
          </button>

          <form action={cerrarSesion}>
            <BotonSalir />
          </form>
        </FloatingPanel>
      )}

      {/* Fuera del panel: el panel se desmonta al cerrarse y se llevaría el
          modal con él. */}
      {acercaDeAbierto && <AboutModal onCerrar={() => setAcercaDeAbierto(false)} />}
    </>
  )
}
