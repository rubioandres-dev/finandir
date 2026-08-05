import type { Moneda } from './types'

/**
 * Formato de números y fechas según la región del usuario.
 *
 * POR QUÉ ESTO IMPORTA MÁS DE LO QUE PARECE
 *
 * "10/09/2026" es el 10 de septiembre para un argentino y el 9 de octubre
 * para un estadounidense. No es una preferencia estética: es la misma cadena
 * significando dos días distintos. Hasta la 009 la app respondía siempre
 * es-AR, sin preguntar.
 *
 * CÓMO SE USA
 *
 * Las funciones de acá son puras y piden el locale explícito. Para no tener
 * que pasarlo en cada una de las 55 llamadas que hay en la app,
 * `crearFormateadores(locale)` devuelve las mismas funciones ya atadas a un
 * locale, con los MISMOS nombres que las de `lib/types.ts`. Así un componente
 * migra cambiando el import por una línea:
 *
 *   const { formatearMonto, formatearFecha } = useFormatoRegional()
 *
 * y ninguna de sus llamadas cambia.
 */

export type Locale = 'es-AR' | 'es-ES' | 'en-US'

export const LOCALE_POR_DEFECTO: Locale = 'es-AR'

/**
 * Regiones que la app ofrece.
 *
 * Tiene que coincidir con el CHECK `user_profiles_locale_valido` de la 009:
 * agregar uno acá sin agregarlo allá hace que el guardado rebote.
 */
export const CATALOGO_LOCALES: {
  codigo: Locale
  pais: string
  bandera: string
  ejemplo: string
}[] = [
  { codigo: 'es-AR', pais: 'Argentina', bandera: '🇦🇷', ejemplo: '$ 1.234,56 · 10/09/2026' },
  { codigo: 'es-ES', pais: 'España', bandera: '🇪🇸', ejemplo: '1.234,56 € · 10/09/2026' },
  { codigo: 'en-US', pais: 'Estados Unidos', bandera: '🇺🇸', ejemplo: '$1,234.56 · 09/10/2026' },
]

const CODIGOS = new Set<string>(CATALOGO_LOCALES.map((l) => l.codigo))

/** Lleva a un locale soportado lo que venga de la base o de un formulario. */
export function normalizarLocale(valor: string | null | undefined): Locale {
  const codigo = valor?.trim()
  return codigo && CODIGOS.has(codigo) ? (codigo as Locale) : LOCALE_POR_DEFECTO
}

export function nombreDeRegion(locale: Locale): string {
  return CATALOGO_LOCALES.find((l) => l.codigo === locale)?.pais ?? locale
}

// --- Dinero ------------------------------------------------------------------

/**
 * Un formateador por (locale, moneda), construido a demanda.
 *
 * `Intl.NumberFormat` es caro de instanciar y esto corre una vez por fila de
 * cada listado. La clave lleva las dos partes porque el mismo peso se escribe
 * distinto en cada región.
 */
const formateadoresDeMonto = new Map<string, Intl.NumberFormat>()

export function formatCurrency(monto: number, moneda: Moneda, locale: Locale): string {
  const clave = `${locale}:${moneda}`
  let formateador = formateadoresDeMonto.get(clave)

  if (!formateador) {
    try {
      formateador = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: moneda,
        maximumFractionDigits: 2,
      })
    } catch {
      // Un código de moneda que Intl no conoce no puede tumbar un listado
      // entero: se muestra el número con el código adelante y sigue.
      return `${moneda} ${monto.toLocaleString(locale, { maximumFractionDigits: 2 })}`
    }
    formateadoresDeMonto.set(clave, formateador)
  }

  return formateador.format(monto)
}

// --- Fechas ------------------------------------------------------------------

/**
 * Parte "YYYY-MM-DD" en un Date de UTC.
 *
 * TODAS las fechas de la app son strings de día, sin hora. `new Date(iso)` las
 * interpreta como medianoche UTC y después las muestra en la zona local, que
 * en Argentina es UTC-3: el día sale corrido y todo lo fechado el 1° muestra
 * el mes anterior. Armar el Date en UTC y formatearlo en UTC evita el corrimiento.
 */
function aFechaUtc(fecha: string): { fecha: Date; anio: number; dia: number } {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return { fecha: new Date(Date.UTC(anio, mes - 1, dia)), anio, dia }
}

const formateadoresDeFecha = new Map<string, Intl.DateTimeFormat>()

function formateadorDeFecha(locale: Locale, opciones: Intl.DateTimeFormatOptions, clave: string) {
  const id = `${locale}:${clave}`
  let formateador = formateadoresDeFecha.get(id)
  if (!formateador) {
    formateador = new Intl.DateTimeFormat(locale, { ...opciones, timeZone: 'UTC' })
    formateadoresDeFecha.set(id, formateador)
  }
  return formateador
}

/** Fecha numérica: `10/09/2026` en es-*, `09/10/2026` en en-US. */
export function formatDate(fecha: string, locale: Locale): string {
  return formateadorDeFecha(
    locale,
    { day: '2-digit', month: '2-digit', year: 'numeric' },
    'corta'
  ).format(aFechaUtc(fecha).fecha)
}

/**
 * Fecha en palabras: `10 de septiembre`, `September 10`.
 *
 * El año se omite cuando es el actual — en un listado de movimientos del mes
 * repetirlo en cada fila es ruido. `anioActual` se pasa desde afuera para que
 * la función siga siendo pura y verificable sin depender del reloj.
 */
export function formatHumanDate(fecha: string, locale: Locale, anioActual?: number): string {
  const { fecha: comoDate, anio } = aFechaUtc(fecha)
  const mismoAnio = anioActual !== undefined && anio === anioActual

  return formateadorDeFecha(
    locale,
    mismoAnio
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' },
    mismoAnio ? 'humana' : 'humana-con-anio'
  ).format(comoDate)
}

/** Mes abreviado a tres letras con el año corto: `Sep 26`, `Sept 26`. */
export function formatShortMonth(periodo: string, locale: Locale): string {
  const [anio, mes] = periodo.split('-').map(Number)
  const nombre = formateadorDeFecha(locale, { month: 'short' }, 'mes-corto').format(
    new Date(Date.UTC(anio, mes - 1, 1))
  )

  // Intl devuelve "sept." o "sep" según el locale: se saca el punto y se pone
  // en mayúscula inicial para que las etiquetas del gráfico queden parejas.
  const limpio = nombre.replace('.', '')
  return `${limpio.charAt(0).toUpperCase()}${limpio.slice(1)} ${String(anio).slice(2)}`
}

// --- Atado a un locale -------------------------------------------------------

export type Formateadores = {
  locale: Locale
  /** Mismo nombre y misma firma que el de `lib/types.ts`, ya con el locale. */
  formatearMonto: (valor: number, moneda: Moneda) => string
  /** Fecha en palabras, sin el año si es el actual. */
  formatearFecha: (fecha: string) => string
  /** Fecha numérica DD/MM/YYYY o MM/DD/YYYY. */
  formatearFechaNumerica: (fecha: string) => string
  /** Mes abreviado para ejes de gráficos. */
  formatearMesCorto: (periodo: string) => string
}

/**
 * Las mismas funciones, atadas a un locale.
 *
 * `anioActual` se resuelve una vez acá y no en cada llamada: en un listado de
 * 200 filas eso son 200 `Date` menos.
 */
export function crearFormateadores(locale: Locale): Formateadores {
  const anioActual = new Date().getUTCFullYear()

  return {
    locale,
    formatearMonto: (valor, moneda) => formatCurrency(valor, moneda, locale),
    formatearFecha: (fecha) => formatHumanDate(fecha, locale, anioActual),
    formatearFechaNumerica: (fecha) => formatDate(fecha, locale),
    formatearMesCorto: (periodo) => formatShortMonth(periodo, locale),
  }
}
