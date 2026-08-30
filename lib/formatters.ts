import { MASCARA_DE_MONTO } from './privacy-mode'
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

/** Un importe partido en sus piezas, para poder darle a cada una su tamaño. */
export type PartesDeMonto = {
  /** Símbolo de la moneda: `$`, `US$`, `€`. Vacío si el locale no lo emite. */
  symbol: string
  /** Parte entera ya con separadores de miles: `1.500.000`. */
  integerPart: string
  /** Separador + decimales, listos para pegar: `,00`. Vacío si no hay. */
  decimalPart: string
  /** El importe completo, por si hace falta en un `title` o un `aria-label`. */
  fullFormatted: string
}

/**
 * El mismo importe de `formatCurrency`, pero desarmado.
 *
 * POR QUÉ CON `formatToParts` Y NO PARTIENDO EL STRING
 *
 * La tentación es formatear y cortar por la última coma. No funciona: el
 * separador decimal es coma en es-* y punto en en-US, el símbolo va adelante
 * en unos locales y atrás en otros, y algunos meten un espacio duro (U+00A0)
 * que no es el espacio que uno busca. `formatToParts` devuelve cada pieza ya
 * etiquetada por Intl, que es el único que sabe las reglas de cada región.
 *
 * Sirve para mostrar los centavos más chicos y elevados que la parte entera:
 * el peso de la cifra está en los millones, no en los dos dígitos finales.
 */
export function formatCurrencyParts(
  monto: number,
  moneda: Moneda,
  locale: Locale
): PartesDeMonto {
  const fullFormatted = formatCurrency(monto, moneda, locale)

  let partes: Intl.NumberFormatPart[]
  try {
    partes = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: moneda,
      maximumFractionDigits: 2,
    }).formatToParts(monto)
  } catch {
    // Mismo fallback que `formatCurrency`: un código que Intl no conoce no
    // puede romper la card.
    return { symbol: moneda, integerPart: String(Math.trunc(monto)), decimalPart: '', fullFormatted }
  }

  let symbol = ''
  let integerPart = ''
  let decimalPart = ''

  for (const parte of partes) {
    switch (parte.type) {
      case 'currency':
        symbol = parte.value
        break
      case 'integer':
      case 'group':
        integerPart += parte.value
        break
      case 'minusSign':
        // El signo va pegado a la parte entera: separarlo dejaría un "−"
        // suelto con el tamaño del símbolo de moneda.
        integerPart = parte.value + integerPart
        break
      case 'decimal':
      case 'fraction':
        decimalPart += parte.value
        break
      // `literal` es el espacio entre símbolo e importe: lo pone el layout.
    }
  }

  return { symbol, integerPart, decimalPart, fullFormatted }
}

/**
 * Las piezas que Intl arma para una moneda, sin el número.
 *
 * Se formatea un 0 y se leen las partes: es la única forma de saber si el
 * símbolo va antes o después, si hay espacio duro en el medio y cuál es. Un
 * `$ ••••` escrito a mano saldría mal en es-ES, donde el € va al final.
 */
function piezasDeMoneda(moneda: Moneda, locale: Locale): Intl.NumberFormatPart[] | null {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: moneda,
      maximumFractionDigits: 2,
    }).formatToParts(0)
  } catch {
    return null
  }
}

/** Las partes que ocupa el número, y que la máscara reemplaza entera. */
const PARTES_NUMERICAS = new Set(['integer', 'group', 'decimal', 'fraction'])

/**
 * El importe tapado: se conserva el símbolo de la moneda y se pierde el resto.
 *
 * LA MÁSCARA ES DE LARGO FIJO A PROPÓSITO. Reemplazar dígito por dígito
 * —"$ •.•••,••"— deja ver cuántas cifras tiene el número, que es justo el dato
 * que importa esconder: no es lo mismo un saldo de cuatro dígitos que uno de
 * siete. Con largo fijo no se filtra ni el orden de magnitud.
 *
 * El símbolo se queda porque no es sensible y porque la app muestra libros de
 * varias monedas en la misma pantalla: sin él, dos filas tapadas de distinta
 * divisa serían indistinguibles.
 */
export function formatCurrencyOculto(moneda: Moneda, locale: Locale): string {
  const piezas = piezasDeMoneda(moneda, locale)
  if (!piezas) return `${moneda} ${MASCARA_DE_MONTO}`

  let puesta = false

  return piezas
    .map((pieza) => {
      if (!PARTES_NUMERICAS.has(pieza.type)) return pieza.value
      if (puesta) return ''
      puesta = true
      return MASCARA_DE_MONTO
    })
    .join('')
}

/** El equivalente tapado de `formatCurrencyParts`. */
export function formatCurrencyPartsOculto(moneda: Moneda, locale: Locale): PartesDeMonto {
  const piezas = piezasDeMoneda(moneda, locale)

  return {
    symbol: piezas?.find((p) => p.type === 'currency')?.value ?? moneda,
    integerPart: MASCARA_DE_MONTO,
    // Vacío y no "••": los decimales tapados serían dos puntitos sueltos y
    // elevados que no se leen como parte del mismo número.
    decimalPart: '',
    fullFormatted: formatCurrencyOculto(moneda, locale),
  }
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
  /**
   * true si los importes salen enmascarados.
   *
   * Los formateadores ya lo aplican solos; está expuesto para lo que NO es un
   * importe formateado y también hay que tapar —las barras de un gráfico, por
   * ejemplo, que dibujan la magnitud sin escribirla—.
   */
  oculto: boolean
  /** Mismo nombre y misma firma que el de `lib/types.ts`, ya con el locale. */
  formatearMonto: (valor: number, moneda: Moneda) => string
  /** El importe desarmado en símbolo, entero y decimales. */
  partesDeMonto: (valor: number, moneda: Moneda) => PartesDeMonto
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
export function crearFormateadores(locale: Locale, oculto = false): Formateadores {
  const anioActual = new Date().getUTCFullYear()

  return {
    locale,
    oculto,
    // El modo privado se aplica ACÁ y no en cada vista: es el único punto por
    // el que pasan los importes de toda la app, así del cliente como del
    // servidor. Taparlos en el formateador es lo que hace que no quede ninguno
    // suelto en una pantalla que nadie se acordó de tocar.
    formatearMonto: (valor, moneda) =>
      oculto ? formatCurrencyOculto(moneda, locale) : formatCurrency(valor, moneda, locale),
    partesDeMonto: (valor, moneda) =>
      oculto ? formatCurrencyPartsOculto(moneda, locale) : formatCurrencyParts(valor, moneda, locale),
    formatearFecha: (fecha) => formatHumanDate(fecha, locale, anioActual),
    formatearFechaNumerica: (fecha) => formatDate(fecha, locale),
    formatearMesCorto: (periodo) => formatShortMonth(periodo, locale),
  }
}
