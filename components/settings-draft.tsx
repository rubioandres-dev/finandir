'use client'

import { useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { Check, Loader2, RotateCcw, Save } from 'lucide-react'
import { guardarAjustes, type AjustesAGuardar } from '@/app/dashboard/settings/actions'
import { useTraduccion } from '@/components/currency-provider'
import type { Locale } from '@/lib/formatters'
import type { Clave, Idioma } from '@/lib/i18n'
import { normalizarModulos, type EstadoDeModulos } from '@/lib/modules'

/**
 * Confirmación diferida de Ajustes.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * Módulos, región e idioma guardaban al toque: cada switch era una Server
 * Action, un upsert a `user_profiles`, un `revalidatePath('/dashboard',
 * 'layout')` y un `router.refresh()`. Apagar tres módulos eran tres viajes
 * completos, y cada uno reconstruía el layout entero —barra inferior, bandeja
 * "Más", providers— con su parpadeo. Peor: el estado optimista se revertía
 * solo si el servidor fallaba, así que un rato de latencia mostraba la app en
 * un estado que todavía no existía en la base.
 *
 * CÓMO FUNCIONA
 *
 * Hay dos copias de los mismos valores. `guardados` es la verdad del servidor;
 * `borrador` es lo que el usuario está tocando. Las secciones pintan SIEMPRE el
 * borrador y escriben SIEMPRE en el borrador: ninguna llama al servidor. Cuando
 * los dos difieren aparece la barra, y recién "Guardar cambios" manda todo
 * junto en un upsert y una revalidación.
 *
 * POR QUÉ NO HAY EFECTO QUE SINCRONICE LAS DOS COPIAS
 *
 * Después de guardar, el `router.refresh()` vuelve a renderizar el Server
 * Component y baja props nuevas. Sincronizar eso con un `useEffect` +
 * `setState` dispara un render en cascada y lo marca la regla
 * `react-hooks/set-state-in-effect` que el resto de la app ya respeta. Se
 * ajusta DURANTE el render comparando por valor, que es el patrón que React
 * documenta para "props que reemplazan estado".
 *
 * QUÉ NO ENTRA ACÁ
 *
 * Las divisas de trabajo siguen guardando al toque. No es un olvido: cambiarlas
 * altera la lista del selector del header y el filtro de todas las vistas, así
 * que dejarlas en un borrador que todavía no se confirmó mostraría un header
 * ofreciendo divisas que el servidor no conoce.
 */

export type AjustesEditables = {
  locale: Locale
  idioma: Idioma
  modulos: EstadoDeModulos
}

/**
 * Firma canónica de un estado de módulos.
 *
 * Compara por VALOR y no por identidad: `{}` y `{ fire: true }` describen lo
 * mismo —ausente significa activo, y `true` es el default— así que normalizar
 * antes de comparar evita que la barra aparezca por un cambio que no cambia
 * nada. Las claves se ordenan porque el orden de inserción de un objeto no es
 * información.
 */
function firmaDeModulos(modulos: EstadoDeModulos): string {
  const limpio = normalizarModulos(modulos)
  return Object.entries(limpio)
    .filter(([, activo]) => activo === false)
    .map(([modulo]) => modulo)
    .sort()
    .join(',')
}

function sonIguales(a: AjustesEditables, b: AjustesEditables): boolean {
  return (
    a.locale === b.locale &&
    a.idioma === b.idioma &&
    firmaDeModulos(a.modulos) === firmaDeModulos(b.modulos)
  )
}

type Contexto = {
  /** Lo que las secciones tienen que pintar: el borrador, no el servidor. */
  valores: AjustesEditables
  editar: <C extends keyof AjustesEditables>(campo: C, valor: AjustesEditables[C]) => void
  /** true mientras el lote está en vuelo: las secciones se bloquean. */
  guardando: boolean
  /** true si `user_profiles` todavía no tiene las columnas: nada es editable. */
  faltaMigracion: boolean
}

const AjustesContext = createContext<Contexto | null>(null)

export function useAjustesEnBorrador(): Contexto {
  const contexto = useContext(AjustesContext)
  if (!contexto) {
    throw new Error('useAjustesEnBorrador debe usarse dentro de <SettingsDraftProvider>')
  }
  return contexto
}

/** Cuánto mide la barra inferior de navegación, para no quedar tapados por ella. */
const ALTURA_NAV = 'mb-[4.25rem] lg:mb-4'

export function SettingsDraftProvider({
  inicial,
  faltaMigracion,
  children,
}: {
  inicial: AjustesEditables
  faltaMigracion: boolean
  children: React.ReactNode
}) {
  const router = useRouter()
  const { t } = useTraduccion()

  const [guardados, setGuardados] = useState<AjustesEditables>(inicial)
  const [borrador, setBorrador] = useState<AjustesEditables>(inicial)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)
  const [guardando, iniciar] = useTransition()

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ajuste durante el render: el servidor mandó valores distintos de los que
  // teníamos por guardados, así que gana el servidor y el borrador se rehace.
  // En la práctica sólo ocurre después de nuestro propio guardado, cuando los
  // dos ya coinciden; está para que una edición desde otra pestaña no deje esta
  // mostrando datos viejos.
  if (!sonIguales(guardados, inicial)) {
    setGuardados(inicial)
    setBorrador(inicial)
  }

  const sucio = !sonIguales(borrador, guardados)

  const editar = useCallback(
    <C extends keyof AjustesEditables>(campo: C, valor: AjustesEditables[C]) => {
      setError(null)
      setExito(false)
      setBorrador((previo) => ({ ...previo, [campo]: valor }))
    },
    []
  )

  const contexto = useMemo<Contexto>(
    () => ({ valores: borrador, editar, guardando, faltaMigracion }),
    [borrador, editar, guardando, faltaMigracion]
  )

  /** Qué secciones cambiaron, para nombrarlas en la barra. */
  const cambios: Clave[] = []
  if (firmaDeModulos(borrador.modulos) !== firmaDeModulos(guardados.modulos)) {
    cambios.push('ajustes.cambioModulos')
  }
  if (borrador.locale !== guardados.locale) cambios.push('ajustes.cambioRegion')
  if (borrador.idioma !== guardados.idioma) cambios.push('ajustes.cambioIdioma')

  function descartar() {
    setBorrador(guardados)
    setError(null)
    setExito(false)
  }

  function guardar() {
    if (!sucio || guardando) return

    // Sólo lo que cambió. Mandar el resto pisaría con el valor que esta pestaña
    // leyó al cargar algo que puede haber cambiado en otro lado mientras tanto.
    const cambio: AjustesAGuardar = {
      ...(borrador.locale !== guardados.locale ? { locale: borrador.locale } : {}),
      ...(borrador.idioma !== guardados.idioma ? { idioma: borrador.idioma } : {}),
      ...(firmaDeModulos(borrador.modulos) !== firmaDeModulos(guardados.modulos)
        ? { modulos: normalizarModulos(borrador.modulos) }
        : {}),
    }

    const confirmado = borrador

    if (temporizador.current) clearTimeout(temporizador.current)
    setError(null)

    iniciar(async () => {
      const resultado = await guardarAjustes(cambio)

      if (resultado.error) {
        setError(resultado.error)
        return
      }

      // El servidor ya tiene esto: pasa a ser la verdad y la barra se va.
      setGuardados(confirmado)
      setExito(true)
      temporizador.current = setTimeout(() => setExito(false), 2600)

      // Idioma, formato y navegación los baja el provider desde el layout: sin
      // esto la app sigue mostrando lo anterior hasta la próxima navegación.
      router.refresh()
    })
  }

  const visible = sucio || guardando || exito || error !== null

  return (
    <AjustesContext.Provider value={contexto}>
      {children}

      {/* Reserva el alto de la barra para que no tape la última card. */}
      {visible && <div className="h-24" aria-hidden />}

      {visible && (
        <div
          role="region"
          aria-label={t('ajustes.barraAria')}
          className="safe-bottom safe-x pointer-events-none fixed inset-x-0 bottom-0 z-[45]"
        >
          {/* Fondo SÓLIDO, no `glass-card`.
              El vidrio deja ver el contenido de abajo, y esta barra se apoya
              justo encima de un listado de switches: los textos quedaban
              compitiendo con las filas que se transparentaban detrás. `bg-menu`
              es el mismo sólido que usan las hojas modales —#232633 en oscuro,
              blanco en claro— así que sirve en los dos temas. El borde dorado
              entero (y no al 30 % como `glass-stroke`) más la sombra la
              despegan del fondo sin depender del blur. */}
          <div
            className={`barra-ajustes pointer-events-auto mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-2xl border border-gold-leaf bg-menu p-3.5 shadow-2xl shadow-midnight-navy/60 sm:flex-row sm:items-center sm:justify-between ${ALTURA_NAV}`}
          >
            {/* --- Estado ------------------------------------------------- */}
            <div className="flex min-w-0 items-start gap-2.5">
              {exito && !sucio ? (
                <Check className="mt-0.5 size-4 shrink-0 text-income" aria-hidden />
              ) : (
                <Save className="mt-0.5 size-4 shrink-0 text-gold-leaf" aria-hidden />
              )}

              <div className="flex min-w-0 flex-col gap-1">
                <p aria-live="polite" className="text-sm font-medium tracking-tight text-on-background">
                  {exito && !sucio ? t('ajustes.guardadoOk') : t('ajustes.sinGuardar')}
                </p>

                {/* Qué está por cambiar. Sin esto la barra pide confirmar algo
                    que el usuario ya no ve en pantalla si scrolleó. */}
                {sucio && cambios.length > 0 && (
                  <ul className="flex flex-wrap gap-1">
                    {cambios.map((clave) => (
                      <li
                        key={clave}
                        className="rounded-full border border-glass-stroke/50 px-2 py-0.5 text-[10px] font-medium text-on-surface-variant"
                      >
                        {t(clave)}
                      </li>
                    ))}
                  </ul>
                )}

                {error && (
                  <p role="alert" className="text-[11px] leading-snug text-expense">
                    {error}
                  </p>
                )}
              </div>
            </div>

            {/* --- Acciones ----------------------------------------------- */}
            {sucio && (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={descartar}
                  disabled={guardando}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-glass-stroke/60 px-3.5 py-2.5 text-sm font-medium text-on-surface-variant transition hover:border-gold-leaf/60 hover:text-gold-leaf disabled:opacity-45 sm:flex-none"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  {t('ajustes.descartar')}
                </button>

                <button
                  type="button"
                  onClick={guardar}
                  disabled={guardando}
                  className="btn-gold flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
                >
                  {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {guardando ? t('ajustes.guardando') : t('mov.guardarCambios')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AjustesContext.Provider>
  )
}
