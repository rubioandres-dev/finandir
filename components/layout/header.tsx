'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  Bell,
  CalendarDays,
  ChevronDown,
  HandCoins,
  HelpCircle,
  LayoutDashboard,
  Scale,
  Settings,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react'
import { useModuloActivo, useTraduccion } from '@/components/currency-provider'
import { CurrencySelector } from '@/components/currency-selector'
import { useTour } from '@/components/guided-tour'
import { FloatingPanel } from '@/components/layout/floating-panel'
import { ProfileMenu } from '@/components/layout/profile-menu'
import { avanceDentroDelTier, siguienteTier, tierPara } from '@/lib/goals-service'
import type { Aviso, NivelAurem } from '@/lib/header-data'
import type { Clave } from '@/lib/i18n'
import type { Modulo } from '@/lib/modules'

/**
 * Encabezado del dashboard.
 *
 * TRES BLOQUES Y UNA ALTURA FIJA
 *
 * Logo · navegación · herramientas. La barra principal es `h-16` con
 * `items-center`: antes era `py-2.5`, o sea que la altura la definía el más
 * alto de sus hijos. Agregar un control de 36px la empujaba, y la sub-barra de
 * tier se movía con ella — el header cambiaba de alto según qué hubiera adentro.
 *
 * EL CONTENEDOR ES EL MISMO QUE EL DEL DASHBOARD
 *
 * `max-w-7xl` (80rem) coincide exactamente con el ancho al que se expande el
 * `<main>` del Home en escritorio (ver `main:has(> .ancho-dashboard)` en
 * globals.css), así que el logo y el avatar caen sobre el borde de las cards.
 *
 * En el RESTO de las vistas el `<main>` sigue siendo `max-w-2xl`, y ahí el
 * header queda más ancho que el contenido. Es a propósito: el encabezado es
 * cromo global y encogerlo por página haría que el logo se moviera al navegar,
 * que es peor que la diferencia de ancho.
 *
 * `safe-x` y no `px-4 sm:px-6 lg:px-8`: da los mismos valores a través de
 * `--gutter`, pero además protege del notch en apaisado. Está documentado en
 * globals.css.
 */

type Enlace = {
  href: string
  etiqueta: Clave
  Icono: typeof Wallet
  /** `undefined` = no depende de ningún módulo. */
  modulo?: Modulo
}

/**
 * Los que siempre están a la vista desde `lg`.
 *
 * Son los mismos cuatro de la barra inferior de mobile. Que las dos
 * navegaciones muestren lo mismo es lo que hace que cambiar de dispositivo no
 * se sienta como cambiar de app.
 */
const PRINCIPALES: Enlace[] = [
  { href: '/dashboard', etiqueta: 'nav.inicio', Icono: LayoutDashboard },
  { href: '/dashboard/accounts', etiqueta: 'nav.cuentas', Icono: Wallet, modulo: 'accounts' },
  {
    href: '/dashboard/transactions',
    etiqueta: 'nav.movimientos',
    Icono: ArrowLeftRight,
    modulo: 'transactions',
  },
  {
    href: '/dashboard/investments',
    etiqueta: 'nav.inversiones',
    Icono: TrendingUp,
    modulo: 'investments',
  },
]

/** Se despliegan bajo "Más" cuando no hay ancho para todos. */
const SECUNDARIOS: Enlace[] = [
  { href: '/dashboard/fire', etiqueta: 'nav.fire', Icono: TrendingUp, modulo: 'fire' },
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
  { href: '/dashboard/settings', etiqueta: 'nav.ajustes', Icono: Settings },
]

/**
 * Una sola definición del pill para que activos e inactivos no puedan
 * divergir en padding. Era el origen de la desalineación: cada estado traía su
 * propio `border`, y el inactivo lo tenía transparente para compensar — con
 * cualquier retoque, un píxel de diferencia.
 */
const PILL =
  'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all'
const PILL_ACTIVO = 'border-gold-leaf/25 bg-gold-leaf/10 text-gold-leaf'
const PILL_INACTIVO =
  'border-transparent text-on-surface-variant hover:bg-gold-leaf/[0.06] hover:text-gold-leaf'

/** Un botón de la fila de herramientas. Mismo alto que el avatar (36 px). */
const HERRAMIENTA =
  'grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl border transition active:scale-90'

function esRutaActiva(href: string, ruta: string): boolean {
  // /dashboard sería prefijo de todas: solo coincide exacto.
  return href === '/dashboard' ? ruta === href : ruta.startsWith(href)
}

function EnlaceDeNav({ enlace, ruta }: { enlace: Enlace; ruta: string }) {
  const { t } = useTraduccion()
  const activa = esRutaActiva(enlace.href, ruta)
  const { Icono } = enlace

  return (
    <Link
      href={enlace.href}
      aria-current={activa ? 'page' : undefined}
      className={`${PILL} ${activa ? PILL_ACTIVO : PILL_INACTIVO}`}
    >
      <Icono className="size-4 shrink-0" aria-hidden />
      {t(enlace.etiqueta)}
    </Link>
  )
}

/**
 * Bandeja "Más" de escritorio.
 *
 * El corte es a 1400 px y se resuelve SOLO CON CSS: los secundarios y este
 * botón son mutuamente excluyentes con `min-[1400px]:`. La alternativa era medir
 * el ancho con un `resize` y decidir en JavaScript, que agrega un render por
 * cada arrastre de la ventana y —peor— hace que el servidor y el cliente
 * rendericen navegaciones distintas hasta que corre el primer efecto.
 */
function MenuMas({ enlaces, ruta }: { enlaces: Enlace[]; ruta: string }) {
  const { t } = useTraduccion()
  const [abierto, setAbierto] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const cerrar = useCallback(() => setAbierto(false), [])

  if (enlaces.length === 0) return null

  const hayActivo = enlaces.some((enlace) => esRutaActiva(enlace.href, ruta))

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((previo) => !previo)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        className={`${PILL} cursor-pointer ${hayActivo ? PILL_ACTIVO : PILL_INACTIVO}`}
      >
        {t('nav.mas')}
        <ChevronDown
          className={`size-3.5 transition-transform ${abierto ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {abierto && (
        <FloatingPanel
          ancla={boton}
          onCerrar={cerrar}
          ancho="w-56"
          rol="menu"
          etiqueta={t('nav.masSecciones')}
        >
          <ul className="flex flex-col">
            {enlaces.map((enlace) => {
              const activa = esRutaActiva(enlace.href, ruta)
              const { Icono } = enlace

              return (
                <li key={enlace.href}>
                  <Link
                    href={enlace.href}
                    onClick={cerrar}
                    aria-current={activa ? 'page' : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition hover:bg-gold-leaf/[0.07] ${
                      activa ? 'text-gold-leaf' : 'text-on-surface-variant'
                    }`}
                  >
                    <Icono className="size-4 shrink-0" aria-hidden />
                    {t(enlace.etiqueta)}
                  </Link>
                </li>
              )
            })}
          </ul>
        </FloatingPanel>
      )}
    </>
  )
}

function Notificaciones({ avisos }: { avisos: Aviso[] }) {
  const [abierto, setAbierto] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const cerrar = useCallback(() => setAbierto(false), [])

  const hayUrgentes = avisos.some((a) => a.urgente)

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((previo) => !previo)}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        aria-label={
          avisos.length === 0
            ? 'Notificaciones: sin avisos'
            : `Notificaciones: ${avisos.length} aviso${avisos.length === 1 ? '' : 's'}`
        }
        className={`${HERRAMIENTA} relative border-glass-stroke/60 text-on-surface-variant hover:border-gold-leaf/60 hover:text-gold-leaf`}
      >
        <Bell className="size-[18px]" aria-hidden />
        {avisos.length > 0 && (
          <span
            className={`absolute right-1.5 top-1.5 size-2 rounded-full ring-2 ring-background ${
              hayUrgentes ? 'bg-error-rose' : 'bg-gold-leaf'
            }`}
            aria-hidden
          />
        )}
      </button>

      {abierto && (
        <FloatingPanel
          ancla={boton}
          onCerrar={cerrar}
          ancho="w-72"
          rol="dialog"
          etiqueta="Próximos vencimientos"
        >
          <div className="flex items-center justify-between gap-2 px-2.5 py-2">
            <p className="aurem-caps text-[10px] text-gold-leaf/70">Próximos 7 días</p>
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar notificaciones"
              className="-mr-1 grid size-6 place-items-center rounded-lg text-on-surface-variant transition active:scale-90 hover:bg-gold-leaf/[0.07] hover:text-gold-leaf"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>

          {avisos.length === 0 ? (
            <p className="px-2.5 pb-3 pt-1 text-xs text-subtle">
              No tenés cierres ni vencimientos cerca.
            </p>
          ) : (
            <ul className="flex flex-col">
              {avisos.map((aviso) => (
                <li
                  key={aviso.id}
                  className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition hover:bg-gold-leaf/[0.07]"
                >
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${
                      aviso.urgente ? 'bg-error-rose' : 'bg-gold-leaf'
                    }`}
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-medium">{aviso.titulo}</span>
                    <span
                      className={`text-[11px] ${aviso.urgente ? 'text-error-rose' : 'text-subtle'}`}
                    >
                      {aviso.detalle}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/dashboard/calendar"
            onClick={cerrar}
            className="mt-1 block rounded-xl px-2.5 py-2 text-[11px] font-medium text-gold-leaf transition hover:bg-gold-leaf/[0.07]"
          >
            Ver el calendario completo →
          </Link>
        </FloatingPanel>
      )}
    </>
  )
}

/**
 * Botón de ayuda.
 *
 * En dorado pleno y no con el tratamiento sobrio del resto: es el único control
 * que no hace nada con el dinero, y tiene que ser encontrable por alguien que se
 * perdió.
 *
 * Oculto por debajo de `sm`: en un teléfono angosto la fila de herramientas ya
 * son cuatro controles y el quinto empuja al selector de moneda contra el logo.
 * El recorrido sigue estando en el menú del avatar, que sí entra siempre.
 */
function BotonDeAyuda() {
  const { t } = useTraduccion()
  const { abrirTour } = useTour()

  return (
    <button
      type="button"
      onClick={abrirTour}
      aria-label={t('tour.ayuda')}
      title={t('tour.ayuda')}
      className={`${HERRAMIENTA} hidden border-gold-leaf/60 text-gold-leaf hover:bg-gold-leaf/10 sm:grid`}
    >
      <HelpCircle className="size-[18px]" aria-hidden />
    </button>
  )
}

export function Header({
  email,
  nombre,
  cotizacion,
  nivel,
  avisos,
  xp = 0,
}: {
  email: string
  nombre: string | null
  cotizacion: number | null
  nivel: NivelAurem
  avisos: Aviso[]
  /** Puntos AUREM acumulados. Definen el tier del badge. */
  xp?: number
}) {
  const ruta = usePathname()
  const { t } = useTraduccion()
  const moduloActivo = useModuloActivo()

  // Coherencia con los módulos: un enlace a una sección apagada es una puerta a
  // algo que el usuario decidió no ver. La barra inferior ya filtraba; el
  // header no, así que en escritorio seguían apareciendo.
  const visible = (enlace: Enlace) => !enlace.modulo || moduloActivo(enlace.modulo)
  const principales = PRINCIPALES.filter(visible)
  const secundarios = SECUNDARIOS.filter(visible)

  const tier = tierPara(xp)
  const proximo = siguienteTier(xp)
  const avance = avanceDentroDelTier(xp)
  const mostrarTier = nivel.tasaDeAhorro !== null || xp > 0

  // z-50, por encima de la barra inferior (z-40): `backdrop-blur` crea un
  // contexto de apilado, así que los paneles de acá no pueden escaparse del
  // z-index del header y quedarían tapados por la barra.
  return (
    <header className="safe-top sticky top-0 z-50 border-b border-glass-stroke/50 bg-background/80 backdrop-blur-xl">
      <div className="safe-x mx-auto w-full max-w-7xl">
        {/* --- Barra principal ------------------------------------------- */}
        <div
          className={`flex h-16 items-center justify-between gap-4 ${
            mostrarTier ? 'border-b border-gold-leaf/10' : ''
          }`}
        >
          {/* 1 · Logo */}
          <Link href="/dashboard" className="flex h-8 shrink-0 items-center gap-2.5">
            <span className="fire-gradient glow-gold grid size-8 place-items-center rounded-xl font-display text-sm font-extrabold text-midnight-navy">
              A
            </span>
            <span className="font-display text-base font-extrabold uppercase tracking-tighter text-gold-leaf">
              Aurem
            </span>
          </Link>

          {/* 2 · Navegación. En mobile la reemplaza la barra inferior.
                 `min-w-0` deja que el bloque se encoja antes que desbordar; sin
                 él, una fracción de flex tiene mínimo `auto` y el nav empuja al
                 avatar fuera de la pantalla. */}
          <nav
            aria-label="Secciones"
            className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex"
          >
            {principales.map((enlace) => (
              <EnlaceDeNav key={enlace.href} enlace={enlace} ruta={ruta} />
            ))}

            {/* Por encima de 1400 px los secundarios se despliegan en línea… */}
            <div className="hidden items-center gap-1 min-[1400px]:flex">
              {secundarios.map((enlace) => (
                <EnlaceDeNav key={enlace.href} enlace={enlace} ruta={ruta} />
              ))}
            </div>

            {/* …y por debajo se agrupan acá. Nunca se ven los dos. */}
            <div className="min-[1400px]:hidden">
              <MenuMas enlaces={secundarios} ruta={ruta} />
            </div>
          </nav>

          {/* 3 · Herramientas y usuario */}
          <div className="flex shrink-0 items-center gap-2">
            <CurrencySelector cotizacion={cotizacion} />

            {/* Pegado al selector a propósito: el consolidado es la salida
                cuando el modo de una sola moneda no alcanza. */}
            <Link
              href="/dashboard/consolidated"
              aria-label={t('nav.consolidado')}
              title={t('nav.consolidadoDetalle')}
              className={`btn-gold-subtle inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-medium ${
                ruta.startsWith('/dashboard/consolidated') ? 'border-gold-leaf' : ''
              }`}
            >
              <Scale className="size-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">{t('nav.consolidado')}</span>
            </Link>

            <BotonDeAyuda />

            <Notificaciones avisos={avisos} />

            {/* El avatar con aro dorado es el ancla visual del sistema, y
                también el disparador del menú de perfil. */}
            <ProfileMenu email={email} nombre={nombre} />
          </div>
        </div>

        {/* --- Sub-barra de tier -----------------------------------------
            Va acá y no dentro del menú del avatar porque además de informar es
            un enlace: sin ella, el XP no tiene puerta desde ninguna pantalla.
            El divisor lo pone el `border-b` de la barra de arriba, así no hay
            dos bordes apilados contra el del propio header. */}
        {mostrarTier && (
          <Link
            href="/dashboard/goals"
            aria-label={`Tier ${tier.nombre}. ${t('nav.objetivos')}`}
            className="flex items-center gap-3 py-2 transition hover:opacity-90"
          >
            <span
              className="aurem-caps shrink-0 rounded-full px-2.5 py-1 text-[9px] text-midnight-navy"
              style={{ backgroundColor: tier.color }}
            >
              {tier.nombre}
            </span>

            <div
              className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-gold-leaf/10"
              role="progressbar"
              aria-valuenow={Math.round(avance * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={
                proximo ? `Avance hacia ${proximo.nombre}` : 'Tier máximo alcanzado'
              }
            >
              <div
                className="fire-gradient h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.max(3, avance * 100)}%` }}
              />
            </div>

            {nivel.tasaDeAhorro !== null && (
              <span className="shrink-0 text-[10px] font-medium tabular-nums text-on-surface-variant">
                {nivel.tasaDeAhorro}% ahorrado
              </span>
            )}
          </Link>
        )}
      </div>
    </header>
  )
}
