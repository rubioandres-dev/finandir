'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { Bell, HelpCircle, Scale, X } from 'lucide-react'
import { useTraduccion } from '@/components/currency-provider'
import { CurrencySelector } from '@/components/currency-selector'
import { useTour } from '@/components/guided-tour'
import { FloatingPanel } from '@/components/layout/floating-panel'
import { ProfileMenu } from '@/components/layout/profile-menu'
import type { Aviso } from '@/lib/header-data'

/** Un botón de la fila de herramientas. Mismo alto que el avatar (36 px). */
const HERRAMIENTA =
  'grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl border transition active:scale-90'

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
      onClick={() => abrirTour('inicio')}
      aria-label={t('tour.ayuda')}
      title={t('tour.ayuda')}
      className={`${HERRAMIENTA} hidden border-gold-leaf/60 text-gold-leaf hover:bg-gold-leaf/10 sm:grid`}
    >
      <HelpCircle className="size-[18px]" aria-hidden />
    </button>
  )
}

/**
 * Encabezado del dashboard.
 *
 * DOS BLOQUES, NO TRES
 *
 * Antes tenía la lista horizontal de módulos en el medio. Se fue a la barra
 * lateral: con nueve secciones más el bloque de herramientas, la fila vivía al
 * borde del quiebre y cada módulo nuevo obligaba a esconder otro detrás de
 * "Más". Lo que queda es identidad a la izquierda y sesión a la derecha.
 *
 * LA SUB-BARRA DE TIER TAMBIÉN SE FUE
 *
 * En escritorio vive al pie de la barra lateral; en mobile, dentro de la bandeja
 * "Más". Sacarla sin reubicarla habría dejado al XP sin puerta desde ninguna
 * pantalla, que es peor que el renglón de más que ocupaba.
 *
 * TAMPOCO HAY HAMBURGUESA
 *
 * Hubo una, `lg:hidden`, que abría la bandeja "Más". La barra inferior es
 * `lg:hidden` también y su pestaña "Más" abre exactamente esa misma bandeja: no
 * existía un ancho donde la hamburguesa fuera la única puerta. Eran dos botones
 * para el mismo diálogo en la misma pantalla, uno arriba y otro abajo, y el de
 * abajo es el que está rotulado y a mano. Se fue el de arriba.
 *
 * `safe-x` y no `px-6`: da el mismo valor a través de `--gutter`, pero además
 * protege del notch en apaisado. Está documentado en globals.css.
 */
export function Header({
  email,
  nombre,
  cotizacion,
  avisos,
}: {
  email: string
  nombre: string | null
  cotizacion: number | null
  avisos: Aviso[]
}) {
  const ruta = usePathname()
  const { t } = useTraduccion()

  // z-50, por encima de la barra lateral (z-40) y de la inferior (z-40):
  // `backdrop-blur` crea un contexto de apilado, así que los paneles de acá no
  // pueden escaparse del z-index del header y quedarían tapados.
  return (
    <header className="safe-top sticky top-0 z-50 border-b border-glass-stroke/50 bg-background/80 backdrop-blur-xl">
      {/* `max-w-7xl mx-auto` en mobile, ancho completo desde `lg`.
          Con la barra lateral fija, centrar el header en el viewport dejaría el
          logo flotando en el medio de la pantalla en vez de arriba de la barra,
          y el avatar despegado del borde derecho. Es el patrón de cualquier
          app-shell: el header cruza todo y la barra cuelga debajo. */}
      <div className="safe-x mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 lg:mx-0 lg:max-w-none">
        {/* --- Izquierda: identidad -------------------------------------

            SIN `shrink-0`: ES EL ARREGLO DEL SCROLL LATERAL

            Los dos bloques de esta fila eran `shrink-0`. Con flexbox eso
            significa que ninguno puede ceder ancho, así que cuando la suma no
            entra el contenido se sale de la caja y arrastra a la página entera:
            aparece el scroll horizontal en toda la app, no sólo en el header.

            Medido en Chromium con el header real —cuando este bloque todavía
            incluía la hamburguesa—: el contenido pedía 393 px fijos, o sea que
            desbordaba 73 px a 320, 33 px a 360 y 3 px a 390. Es decir, en casi
            todos los teléfonos. Sin la hamburguesa sobran ~46 px, pero el
            desborde no desaparece por sí solo: el margen depende del largo del
            correo en el avatar y del selector de moneda, así que la cadena de
            `min-w-0` se queda.

            De los dos bloques, el que cede es éste. El de la derecha son
            objetivos táctiles de 36 px: encogerlos los deja por debajo del
            mínimo y no se pueden tocar.

            `min-w-0` EN LOS TRES NIVELES, Y NO ES DE MÁS

            Un item de flex sin `min-width` explícito no baja de su contenido
            mínimo, y ese piso se propaga hacia arriba: el bloque hereda como
            mínimo el ancho de la palabra completa. `truncate` en el logotipo NO
            alcanza para romperlo —probado: con `overflow: hidden` solo, el
            bloque seguía midiendo sus 143 px y el avatar quedaba 33 px fuera de
            la pantalla a 360—. Hace falta el `min-w-0` explícito en el bloque,
            en el enlace y en la palabra para que la cadena ceda de verdad.

            Con los tres puestos, a 360 el bloque baja a 95 px y todo entra.

            El isotipo lleva `shrink-0` propio, así que lo único que se recorta
            es la palabra. Y por debajo de 414 se esconde entera en vez de
            mostrarse cortada: "Au…" no es un logotipo, es un logotipo roto. */}
        <div className="flex min-w-0 items-center gap-2.5">
          <Link href="/dashboard" className="flex h-8 min-w-0 items-center gap-2.5">
            <span className="fire-gradient glow-gold grid size-8 shrink-0 place-items-center rounded-xl font-display text-sm font-extrabold text-midnight-navy">
              A
            </span>
            <span className="min-w-0 truncate font-display text-base font-extrabold uppercase tracking-tighter text-gold-leaf max-[413px]:hidden">
              Aurem
            </span>
          </Link>
        </div>

        {/* --- Derecha: divisa, ayuda, avisos, cuenta -------------------- */}
        <div className="flex shrink-0 items-center gap-2">
          <CurrencySelector cotizacion={cotizacion} />

          {/* Pegado al selector a propósito: el consolidado es la salida
              cuando el modo de una sola moneda no alcanza. En escritorio ya
              está en la barra lateral, así que acá queda sólo para mobile.

              `max-[359px]:hidden` es el único control que se sacrifica en
              pantallas ultra angostas. Recortar el logotipo alcanza hasta 360;
              por debajo faltan ~33 px y hay que soltar algo. Se suelta éste
              porque es el único de la fila que tiene otra puerta: el
              consolidado también está en la bandeja "Más". El selector de
              moneda, los avisos y la cuenta no están en ningún otro lado. */}
          <Link
            href="/dashboard/consolidated"
            aria-label={t('nav.consolidado')}
            title={t('nav.consolidadoDetalle')}
            className={`btn-gold-subtle inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-medium max-[359px]:hidden lg:hidden ${
              ruta.startsWith('/dashboard/consolidated') ? 'border-gold-leaf' : ''
            }`}
          >
            <Scale className="size-4 shrink-0" aria-hidden />
          </Link>

          <BotonDeAyuda />

          <Notificaciones avisos={avisos} />

          {/* El avatar con aro dorado es el ancla visual del sistema, y
              también el disparador del menú de perfil. */}
          <ProfileMenu email={email} nombre={nombre} />
        </div>
      </div>
    </header>
  )
}
