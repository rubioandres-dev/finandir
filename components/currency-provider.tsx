'use client'

import { useRouter } from 'next/navigation'
import { createContext, useContext, useMemo, useState, useTransition } from 'react'
import { COOKIE_MONEDA, MAX_EDAD_COOKIE_MONEDA } from '@/lib/currency-mode'
import {
  COOKIE_PRIVACIDAD,
  COOKIE_PRIVACIDAD_SESION,
  MAX_EDAD_COOKIE_PRIVACIDAD,
} from '@/lib/privacy-mode'
import {
  crearFormateadores,
  LOCALE_POR_DEFECTO,
  type Formateadores,
  type Locale,
} from '@/lib/formatters'
import {
  crearTraductor,
  IDIOMA_POR_DEFECTO,
  type Idioma,
  type Traductor,
} from '@/lib/i18n'
import { moduloActivo, type EstadoDeModulos, type Modulo } from '@/lib/modules'
import { MONEDAS_POR_DEFECTO } from '@/lib/monedas'
import type { Moneda } from '@/lib/types'

type Contexto = {
  /** Moneda activa. Filtra cuentas, movimientos, tarjetas y presupuestos. */
  modo: Moneda
  cambiarModo: (moneda: Moneda) => void
  /** Divisas que el usuario eligió en el onboarding. La primera es la principal. */
  monedasSeleccionadas: Moneda[]
  /** Formato regional activo: define separadores, símbolo y orden de la fecha. */
  locale: Locale
  /** Idioma de la interfaz. Es una preferencia DISTINTA del formato. */
  idioma: Idioma
  /** Módulos que el usuario apagó en Ajustes. */
  modulos: EstadoDeModulos
  /** true mientras el servidor recarga las vistas con la moneda nueva. */
  cambiando: boolean
  /**
   * Si se muestran las conversiones aproximadas junto a cada importe.
   *
   * Derivado de `modo`: en USD se muestran, en el resto no. Sigue atado al par
   * ARS/USD porque la equivalencia que la app guarda por movimiento
   * (`amount_usd`) es esa; para el resto de las divisas la conversión vive en
   * el consolidado, con su cotización a la vista.
   */
  mostrarEquivalencias: boolean
  /** Modo privado: los importes salen enmascarados en toda la app. */
  oculto: boolean
  /** El ojito. Tapa o destapa por esta sesión, sin tocar la preferencia. */
  alternarPrivacidad: () => void
  /** Ajustes: con qué estado arranca la app, de acá en adelante. */
  fijarPrivacidadPorDefecto: (ocultar: boolean) => void
  /** Lo que Ajustes tiene que mostrar tildado: la preferencia, no el ojito. */
  ocultoPorDefecto: boolean
}

const MonedaContext = createContext<Contexto | null>(null)

/**
 * Provee la moneda activa de la app y la lista de divisas del usuario.
 *
 * Los dos valores iniciales LOS DA EL SERVIDOR (`modoInicial` de la cookie,
 * `monedas` del perfil), no localStorage. Es lo que evita el parpadeo y el
 * mismatch de hidratación: el HTML ya viene filtrado con la misma moneda con
 * la que arranca el cliente.
 *
 * Al cambiar de moneda se escribe la cookie y se pide `router.refresh()`, que
 * vuelve a ejecutar los Server Components y trae los datos de la otra moneda.
 */
export function CurrencyProvider({
  children,
  modoInicial,
  monedas = MONEDAS_POR_DEFECTO,
  locale = LOCALE_POR_DEFECTO,
  idioma = IDIOMA_POR_DEFECTO,
  modulos = {},
  ocultoInicial = false,
  ocultoPorDefecto = false,
}: {
  children: React.ReactNode
  modoInicial: Moneda
  monedas?: Moneda[]
  locale?: Locale
  idioma?: Idioma
  modulos?: EstadoDeModulos
  /** Estado con el que el servidor ya renderizó los importes. */
  ocultoInicial?: boolean
  /** Solo la preferencia, sin el override del ojito. Lo muestra Ajustes. */
  ocultoPorDefecto?: boolean
}) {
  const router = useRouter()
  const [modo, setModo] = useState<Moneda>(modoInicial)
  const [oculto, setOculto] = useState(ocultoInicial)
  const [porDefecto, setPorDefecto] = useState(ocultoPorDefecto)
  const [cambiando, iniciarCambio] = useTransition()

  const valor = useMemo<Contexto>(() => {
    const seleccionadas = monedas.length > 0 ? monedas : MONEDAS_POR_DEFECTO

    // Si el usuario sacó de su lista la moneda que tenía activa, la activa
    // pasa a ser la principal. Se DERIVA en vez de corregirse con un effect:
    // un setState en effect dispararía un render extra y lo marca la regla
    // `react-hooks/set-state-in-effect`. El servidor aplica la misma regla en
    // `normalizarModo`, así que los dos lados coinciden.
    const modoEfectivo = seleccionadas.includes(modo) ? modo : seleccionadas[0]

    return {
      modo: modoEfectivo,
      monedasSeleccionadas: seleccionadas,
      locale,
      idioma,
      modulos,
      cambiando,
      mostrarEquivalencias: modoEfectivo === 'USD',
      oculto,
      ocultoPorDefecto: porDefecto,

      /**
       * El ojito: escribe la cookie de SESIÓN y refresca.
       *
       * El `setOculto` optimista tapa al toque todo lo que formatea el
       * cliente; el `router.refresh()` va a buscar de nuevo lo que formateó el
       * servidor, que en esta app es media pantalla (consolidado, balance,
       * cuentas, deudas). Sin el refresh esos importes quedarían visibles
       * hasta la próxima navegación.
       */
      alternarPrivacidad: () => {
        const siguiente = !oculto

        // Sin `max-age`: cookie de sesión a propósito. Destapar un rato no
        // tiene por qué cambiar con qué arranca la app mañana.
        document.cookie = `${COOKIE_PRIVACIDAD_SESION}=${siguiente ? '1' : '0'}; path=/; SameSite=Lax`

        setOculto(siguiente)
        iniciarCambio(() => router.refresh())
      },

      /** Ajustes: cambia la preferencia y la aplica ya. */
      fijarPrivacidadPorDefecto: (ocultar: boolean) => {
        document.cookie = `${COOKIE_PRIVACIDAD}=${ocultar ? '1' : '0'}; path=/; max-age=${MAX_EDAD_COOKIE_PRIVACIDAD}; SameSite=Lax`

        // Se borra el override del ojito: si no, elegir "ocultar por defecto"
        // no haría nada visible mientras la sesión tenga los importes
        // destapados, y parecería que el interruptor está roto.
        document.cookie = `${COOKIE_PRIVACIDAD_SESION}=; path=/; max-age=0; SameSite=Lax`

        setPorDefecto(ocultar)
        setOculto(ocultar)
        iniciarCambio(() => router.refresh())
      },
      cambiarModo: (moneda: Moneda) => {
        if (moneda === modoEfectivo || !seleccionadas.includes(moneda)) return

        // `path=/` para que valga en todas las rutas, y `SameSite=Lax` porque
        // es una preferencia de UI, no algo que deba viajar entre sitios.
        document.cookie = `${COOKIE_MONEDA}=${moneda}; path=/; max-age=${MAX_EDAD_COOKIE_MONEDA}; SameSite=Lax`

        // Optimista: el selector se pinta ya, sin esperar al servidor.
        setModo(moneda)
        iniciarCambio(() => router.refresh())
      },
    }
  }, [modo, monedas, locale, idioma, modulos, cambiando, oculto, porDefecto, router])

  return <MonedaContext.Provider value={valor}>{children}</MonedaContext.Provider>
}

function useMonedaContext(): Contexto {
  const contexto = useContext(MonedaContext)
  if (!contexto) {
    throw new Error('useModoMoneda debe usarse dentro de <CurrencyProvider>')
  }
  return contexto
}

/** Moneda activa, divisas disponibles y el setter. */
export function useModoMoneda(): Contexto {
  return useMonedaContext()
}

/**
 * Solo la parte de equivalencias.
 *
 * Se conserva con este nombre y esta forma para no tocar `<Monto>` ni sus
 * llamadas: antes venía de su propio contexto y ahora se deriva del modo.
 */
export function useEquivalencias(): { mostrarEquivalencias: boolean } {
  const { mostrarEquivalencias } = useMonedaContext()
  return { mostrarEquivalencias }
}

/**
 * Formateadores atados a la región del usuario.
 *
 * Devuelve funciones con los MISMOS nombres que las de `lib/types.ts`, así un
 * componente migra cambiando el import por una línea y ninguna de sus llamadas
 * cambia:
 *
 *   -  import { formatearMonto } from '@/lib/types'
 *   +  const { formatearMonto } = useFormatoRegional()
 *
 * Memoizado por locale: `crearFormateadores` arma un `Date` para resolver el
 * año actual, y no hace falta rehacerlo en cada render.
 */
export function useFormatoRegional(): Formateadores {
  const { locale, oculto } = useMonedaContext()
  return useMemo(() => crearFormateadores(locale, oculto), [locale, oculto])
}

/**
 * El modo privado y sus dos interruptores.
 *
 * Lo usan el ojito del header y la sección de Ajustes. Para MOSTRAR un importe
 * no hace falta: `useFormatoRegional()` ya lo aplica solo.
 */
export function usePrivacidad(): {
  oculto: boolean
  ocultoPorDefecto: boolean
  alternar: () => void
  fijarPorDefecto: (ocultar: boolean) => void
  cambiando: boolean
} {
  const { oculto, ocultoPorDefecto, alternarPrivacidad, fijarPrivacidadPorDefecto, cambiando } =
    useMonedaContext()

  return {
    oculto,
    ocultoPorDefecto,
    alternar: alternarPrivacidad,
    fijarPorDefecto: fijarPrivacidadPorDefecto,
    cambiando,
  }
}

/**
 * Traductor atado al idioma del usuario.
 *
 * Va aparte de `useFormatoRegional` porque idioma y región son preferencias
 * independientes: se puede querer texto en inglés con formato argentino.
 */
/**
 * Si un módulo está activo para este usuario.
 *
 * Lo consultan la barra inferior, la bandeja "Más" y el dashboard para
 * decidir qué mostrar. Un módulo apagado desaparece de la navegación, pero
 * su ruta sigue existiendo: apagar una sección esconde la puerta, no borra
 * los datos ni rompe un enlace que alguien haya guardado.
 */
export function useModuloActivo(): (modulo: Modulo) => boolean {
  const { modulos } = useMonedaContext()
  return useMemo(() => (modulo: Modulo) => moduloActivo(modulos, modulo), [modulos])
}

export function useTraduccion(): { t: Traductor; idioma: Idioma } {
  const { idioma } = useMonedaContext()
  return useMemo(() => ({ t: crearTraductor(idioma), idioma }), [idioma])
}
