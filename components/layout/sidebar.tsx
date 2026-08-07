'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  ArrowLeftRight,
  CalendarDays,
  HandCoins,
  LayoutDashboard,
  Lightbulb,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Rocket,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useModuloActivo, useTraduccion } from '@/components/currency-provider'
import { avanceDentroDelTier, siguienteTier, tierPara } from '@/lib/goals-service'
import type { Clave } from '@/lib/i18n'
import type { Modulo } from '@/lib/modules'

/**
 * Navegación lateral de escritorio.
 *
 * POR QUÉ REEMPLAZA A LOS LINKS DEL HEADER
 *
 * El header tenía la lista horizontal de módulos. Con nueve secciones y el
 * bloque de herramientas a la derecha, la fila vivía al borde del quiebre: cada
 * módulo nuevo obligaba a esconder otro detrás de "Más", y el nombre de la
 * sección competía por ancho con el selector de moneda. En vertical el espacio
 * es el que sobra, no el que falta.
 *
 * EL ESTADO PLEGADO NO VIVE ACÁ
 *
 * Vive en `SidebarProvider`, porque el contenido principal tiene que correrse
 * con él. Si cada uno guardara su propio booleano, un toggle movería la barra y
 * dejaría el contenido donde estaba.
 */

const CLAVE_ALMACENADA = 'aurem_sidebar_collapsed'

type Seccion = {
  href: string
  etiqueta: Clave
  Icono: LucideIcon
  /** Sin módulo = siempre visible. Los fijos tampoco se pueden apagar. */
  modulo?: Modulo
}

/**
 * Base: las tres que no se pueden apagar.
 *
 * `accounts` y `transactions` son `MODULOS_FIJOS` en `lib/modules.ts` —sin
 * cuentas no hay dónde imputar y sin movimientos no hay app— así que no llevan
 * `modulo`: filtrarlas sería preguntar algo cuya respuesta siempre es sí.
 */
const BASE: Seccion[] = [
  { href: '/dashboard', etiqueta: 'nav.inicio', Icono: LayoutDashboard },
  { href: '/dashboard/accounts', etiqueta: 'nav.cuentas', Icono: Wallet },
  { href: '/dashboard/transactions', etiqueta: 'nav.movimientos', Icono: ArrowLeftRight },
]

/**
 * Conmutables por `ModuleContext`.
 *
 * `Presupuestos` no tiene módulo propio ni ruta propia: desde la 013 el techo de
 * gasto se administra dentro de Ajustes. El ancla lleva directo a esa sección en
 * vez de inventar una pantalla que sería la misma card sola.
 *
 * `Vista consolidada` tampoco es un módulo: es la salida cuando el modo de una
 * sola moneda no alcanza, y apagarla dejaría a alguien con tres divisas sin
 * forma de verlas juntas.
 */
const CONMUTABLES: Seccion[] = [
  {
    href: '/dashboard/investments',
    etiqueta: 'nav.inversiones',
    Icono: TrendingUp,
    modulo: 'investments',
  },
  {
    href: '/dashboard/smart-spend',
    etiqueta: 'nav.gastoInteligente',
    Icono: Lightbulb,
    modulo: 'smart_spend',
  },
  { href: '/dashboard/settings#presupuestos', etiqueta: 'presupuestos.titulo', Icono: PieChart },
  {
    href: '/dashboard/commitments',
    etiqueta: 'modulos.cuotas',
    Icono: TrendingDown,
    modulo: 'commitments',
  },
  {
    href: '/dashboard/calendar',
    etiqueta: 'nav.calendario',
    Icono: CalendarDays,
    modulo: 'calendar',
  },
  { href: '/dashboard/debts', etiqueta: 'nav.deudas', Icono: HandCoins, modulo: 'debts' },
  { href: '/dashboard/goals', etiqueta: 'nav.objetivos', Icono: Target, modulo: 'goals' },
  {
    href: '/dashboard/shared-expenses',
    etiqueta: 'nav.compartidos',
    Icono: Users,
    modulo: 'shared_expenses',
  },
  { href: '/dashboard/fire', etiqueta: 'nav.fire', Icono: Rocket, modulo: 'fire' },
  { href: '/dashboard/consolidated', etiqueta: 'nav.consolidado', Icono: PieChart },
]

// --- Estado compartido -------------------------------------------------------

type Contexto = { plegado: boolean; alternar: () => void }

const SidebarContext = createContext<Contexto | null>(null)

export function useSidebar(): Contexto {
  const contexto = useContext(SidebarContext)
  if (!contexto) throw new Error('useSidebar debe usarse dentro de <SidebarProvider>')
  return contexto
}

/** Sin suscripción: sólo importa el valor con el que se arranca. */
const SIN_CAMBIOS = () => () => {}

/**
 * `false` en el servidor, lo que diga `localStorage` después de hidratar.
 *
 * Leerlo directo daría un mismatch de hidratación. Mismo patrón que
 * `useHidratado` en `profile-menu` y `useYaVisto` en `guided-tour`.
 */
function usePlegadoInicial(): boolean {
  return useSyncExternalStore(
    SIN_CAMBIOS,
    () => {
      try {
        return window.localStorage.getItem(CLAVE_ALMACENADA) === '1'
      } catch {
        return false
      }
    },
    () => false
  )
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const inicial = usePlegadoInicial()
  const [plegadoManual, setPlegadoManual] = useState<boolean | null>(null)

  // Hasta que el usuario toque el botón manda lo guardado. Después manda él, sin
  // que un re-render lo pise con el valor viejo del almacenamiento.
  const plegado = plegadoManual ?? inicial

  const alternar = useCallback(() => {
    setPlegadoManual((previo) => {
      const siguiente = !(previo ?? inicial)
      try {
        window.localStorage.setItem(CLAVE_ALMACENADA, siguiente ? '1' : '0')
      } catch {
        // Sin almacenamiento el estado dura lo que dura la pestaña.
      }
      return siguiente
    })
  }, [inicial])

  const valor = useMemo<Contexto>(() => ({ plegado, alternar }), [plegado, alternar])

  return <SidebarContext.Provider value={valor}>{children}</SidebarContext.Provider>
}

// --- La barra ----------------------------------------------------------------

function esRutaActiva(href: string, ruta: string): boolean {
  // El ancla no es parte de la ruta: `/dashboard/settings#presupuestos` marca
  // activo con `/dashboard/settings`, igual que el enlace de Ajustes.
  const base = href.split('#')[0]
  return base === '/dashboard' ? ruta === base : ruta.startsWith(base)
}

function Fila({
  seccion,
  activa,
  plegado,
}: {
  seccion: Seccion
  activa: boolean
  plegado: boolean
}) {
  const { t } = useTraduccion()
  const { Icono } = seccion
  const nombre = t(seccion.etiqueta)

  return (
    <li className="relative">
      <Link
        href={seccion.href}
        aria-current={activa ? 'page' : undefined}
        // `title` como tooltip: es el que anuncian los lectores de pantalla y el
        // que aparece sin JavaScript. Un tooltip propio en hover sería más
        // vistoso y dejaría afuera al teclado.
        title={plegado ? nombre : undefined}
        className={`group/fila flex items-center gap-3 rounded-xl border-l-2 py-2.5 transition-all duration-200 ${
          plegado ? 'justify-center px-0' : 'px-3'
        } ${
          activa
            ? 'border-l-gold-leaf bg-gold-leaf/10 text-gold-leaf'
            : 'border-l-transparent text-on-surface-variant hover:bg-gold-leaf/[0.06] hover:text-gold-leaf'
        }`}
      >
        <Icono className="size-[18px] shrink-0" aria-hidden />

        {/* El nombre se saca del DOM al plegar, no se esconde con opacidad: un
            texto invisible pero presente lo sigue leyendo el lector de pantalla
            y lo sigue encontrando el buscador del navegador. */}
        {!plegado && <span className="min-w-0 truncate text-sm font-medium">{nombre}</span>}
      </Link>
    </li>
  )
}

export function Sidebar({
  xp = 0,
  tasaDeAhorro = null,
}: {
  xp?: number
  /** El "% ahorrado" que vivía en la sub-barra del header. `null` si no se puede calcular. */
  tasaDeAhorro?: number | null
}) {
  const ruta = usePathname()
  const { t } = useTraduccion()
  const moduloActivo = useModuloActivo()
  const { plegado, alternar } = useSidebar()

  const visibles = CONMUTABLES.filter((s) => !s.modulo || moduloActivo(s.modulo))

  const tier = tierPara(xp)
  const proximo = siguienteTier(xp)
  const avance = avanceDentroDelTier(xp)

  return (
    <aside
      aria-label={t('nav.masSecciones')}
      className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-glass-stroke/40 bg-menu pt-20 transition-all duration-300 lg:flex ${
        plegado ? 'w-20' : 'w-64'
      }`}
    >
      {/* `pt-20` deja pasar el header, que es sticky y va por encima (z-50). */}
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {BASE.map((seccion) => (
            <Fila
              key={seccion.href}
              seccion={seccion}
              activa={esRutaActiva(seccion.href, ruta)}
              plegado={plegado}
            />
          ))}
        </ul>

        <div className="my-2 h-px bg-glass-stroke/30" aria-hidden />

        <ul className="flex flex-col gap-1">
          {visibles.map((seccion) => (
            <Fila
              key={seccion.href}
              seccion={seccion}
              activa={esRutaActiva(seccion.href, ruta)}
              plegado={plegado}
            />
          ))}
        </ul>
      </nav>

      {/* --- Tier ---------------------------------------------------------
          Vive acá desde que salió del header. Sacarlo sin más lo habría dejado
          sólo en la bandeja "Más" de mobile, o sea invisible en escritorio: el
          XP habría dejado de tener puerta desde cualquier pantalla ancha. */}
      {xp > 0 && (
        <Link
          href="/dashboard/goals"
          title={plegado ? `${tier.nombre} · ${t('nav.objetivos')}` : undefined}
          className={`mx-3 mb-2 flex flex-col gap-1.5 rounded-xl border border-glass-stroke/40 px-3 py-2.5 transition hover:border-gold-leaf/50 ${
            plegado ? 'items-center' : ''
          }`}
        >
          <span
            className="aurem-caps shrink-0 rounded-full px-2 py-0.5 text-[9px] text-midnight-navy"
            style={{ backgroundColor: tier.color }}
          >
            {plegado ? tier.nombre.slice(0, 1) : tier.nombre}
          </span>

          {/* La tasa de ahorro se muda con el tier. Sin esto habría desaparecido
              de la app: era el otro dato que llevaba la sub-barra del header. */}
          {!plegado && tasaDeAhorro !== null && (
            <span className="text-[10px] tabular-nums text-on-surface-variant">
              {tasaDeAhorro}% ahorrado
            </span>
          )}

          {!plegado && (
            <div
              className="h-1 w-full overflow-hidden rounded-full bg-gold-leaf/10"
              role="progressbar"
              aria-valuenow={Math.round(avance * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={proximo ? `Avance hacia ${proximo.nombre}` : 'Tier máximo alcanzado'}
            >
              <div
                className="fire-gradient h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.max(3, avance * 100)}%` }}
              />
            </div>
          )}
        </Link>
      )}

      {/* --- Toggle -------------------------------------------------------- */}
      <button
        type="button"
        onClick={alternar}
        aria-expanded={!plegado}
        aria-label={plegado ? t('sidebar.desplegar') : t('sidebar.plegar')}
        title={plegado ? t('sidebar.desplegar') : t('sidebar.plegar')}
        className={`mx-3 mb-4 flex cursor-pointer items-center gap-2.5 rounded-xl border border-glass-stroke/40 px-3 py-2.5 text-on-surface-variant transition-all duration-300 hover:border-gold-leaf/60 hover:text-gold-leaf ${
          plegado ? 'justify-center' : ''
        }`}
      >
        {plegado ? (
          <PanelLeftOpen className="size-[18px] shrink-0" aria-hidden />
        ) : (
          <PanelLeftClose className="size-[18px] shrink-0" aria-hidden />
        )}
        {!plegado && <span className="truncate text-xs font-medium">{t('sidebar.plegar')}</span>}
      </button>
    </aside>
  )
}

/**
 * El contenido principal, corrido para no quedar debajo de la barra.
 *
 * El padding va acá y no en el `<main>` del layout porque el layout es un Server
 * Component y no puede leer el estado plegado. Envolver es más barato que subir
 * todo el layout al cliente.
 */
export function SidebarInset({ children }: { children: React.ReactNode }) {
  const { plegado } = useSidebar()

  return (
    <div className={`transition-all duration-300 ${plegado ? 'lg:pl-20' : 'lg:pl-64'}`}>
      {children}
    </div>
  )
}
