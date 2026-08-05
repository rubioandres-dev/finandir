/**
 * Idioma de la interfaz.
 *
 * IDIOMA Y REGIÓN SON DOS COSAS DISTINTAS
 *
 * La REGIÓN (`lib/formatters.ts`, migración 009) define cómo se escriben los
 * números y las fechas: `$ 1.234,56 · 10/09/2026` o `$1,234.56 · 09/10/2026`.
 * El IDIOMA define en qué lengua está el texto. No son lo mismo y no se
 * deducen uno del otro: un español que vive en Buenos Aires quiere formato
 * es-AR y texto sin voseo, y esa combinación no existe si hay una sola opción.
 *
 * POR QUÉ es-AR Y es SON DOS IDIOMAS Y NO UNO
 *
 * No es solo el voseo. La app está escrita para un contexto donde la inflación
 * es el problema central: habla de dólar MEP, de días de cierre de tarjeta, de
 * "lucas". Nada de eso significa algo para alguien en México o en España. El
 * neutro no es el argentino con los verbos cambiados: es el mismo consejo sin
 * las referencias que solo aplican acá.
 *
 * QUÉ ESTÁ TRADUCIDO Y QUÉ NO
 *
 * Este diccionario cubre la navegación, los ajustes, los objetivos y la guía
 * de uso. El resto de las pantallas —movimientos, cuentas, inversiones— sigue
 * en español: son varios cientos de cadenas y traducirlas a medias daría una
 * interfaz mezclada, que es peor que una en un solo idioma. `t()` devuelve la
 * clave si falta una traducción, así que lo que falte se ve, no se rompe.
 */

export type Idioma = 'es-AR' | 'es' | 'en'

export const IDIOMA_POR_DEFECTO: Idioma = 'es-AR'

export const CATALOGO_IDIOMAS: {
  codigo: Idioma
  nombre: string
  bandera: string
  detalle: string
}[] = [
  {
    codigo: 'es-AR',
    nombre: 'Español (Argentina)',
    bandera: '🇦🇷',
    detalle: 'Voseo y contexto local: MEP, cuotas, inflación',
  },
  {
    codigo: 'es',
    nombre: 'Español neutro',
    bandera: '🌎',
    detalle: 'Sin voseo, finanzas generales',
  },
  { codigo: 'en', nombre: 'English', bandera: '🇺🇸', detalle: 'Standard translation' },
]

const CODIGOS = new Set<string>(CATALOGO_IDIOMAS.map((i) => i.codigo))

export function normalizarIdioma(valor: string | null | undefined): Idioma {
  const codigo = valor?.trim()
  return codigo && CODIGOS.has(codigo) ? (codigo as Idioma) : IDIOMA_POR_DEFECTO
}

export function nombreDeIdioma(idioma: Idioma): string {
  return CATALOGO_IDIOMAS.find((i) => i.codigo === idioma)?.nombre ?? idioma
}

/**
 * Diccionario base, en es-AR.
 *
 * Las claves son jerárquicas y planas (`nav.inicio`) en vez de objetos
 * anidados: así el tipo `Clave` sale solo del objeto y TypeScript marca
 * cualquier clave inventada en el momento de escribirla.
 */
const ES_AR = {
  // --- Navegación -----------------------------------------------------------
  'nav.inicio': 'Inicio',
  'nav.cuentas': 'Cuentas',
  'nav.movimientos': 'Movimientos',
  'nav.inversiones': 'Inversiones',
  'nav.mas': 'Más',
  'nav.masSecciones': 'Más secciones',
  'nav.fire': 'Calculadora FIRE',
  'nav.fireDetalle': 'Cuánto falta para vivir de tus inversiones',
  'nav.calendario': 'Calendario',
  'nav.calendarioDetalle': 'Cierres y vencimientos del mes',
  'nav.deudas': 'Deudas y préstamos',
  'nav.deudasDetalle': 'Lo que debés y lo que te deben',
  'nav.gastoInteligente': 'Gasto inteligente',
  'nav.gastoInteligenteDetalle': 'Contado con descuento o cuotas',
  'nav.consolidado': 'Vista consolidada',
  'nav.consolidadoDetalle': 'Todas tus divisas en un solo total',
  'nav.guia': 'Guía de uso',
  'nav.guiaDetalle': 'Cómo sacarle jugo a AUREM',
  'nav.ajustes': 'Ajustes y perfil',
  'nav.ajustesDetalle': 'Divisas, región, presupuestos y cuenta',
  'nav.objetivos': 'Objetivos y Tier AUREM',
  'nav.objetivosDetalle': 'Tus metas y los logros que desbloqueás',

  // --- Ajustes --------------------------------------------------------------
  'ajustes.idioma': 'Idioma de la interfaz',
  'ajustes.idiomaAyuda':
    'Cambia el texto de la app. La región, que define el formato de números y fechas, se elige aparte.',
  'ajustes.region': 'Región y formato',
  'ajustes.guardando': 'Guardando…',
  'ajustes.guardado': 'Guardado',

  // --- Modal de confirmación de localización --------------------------------
  'localizacion.titulo': '¿Confirmar cambio de localización?',
  'localizacion.cuerpo':
    'La interfaz, los formatos y las guías de uso se van a actualizar a {destino}.',
  'localizacion.confirmar': 'Confirmar',
  'localizacion.cancelar': 'Cancelar',

  // --- Objetivos ------------------------------------------------------------
  'objetivos.titulo': 'Objetivos',
  'objetivos.bajada':
    'Metas con número. Cada una que cumplís suma XP y sube tu Tier: acá no se penaliza el gasto, se reconoce el logro.',
  'objetivos.nuevo': 'Nuevo objetivo',
  'objetivos.sinObjetivos': 'Todavía no definiste ninguna meta.',
  'objetivos.logrado': 'Logrado',
  'objetivos.enProgreso': 'En progreso',
  'objetivos.meta': 'Meta',
  'objetivos.actual': 'Actual',
  'objetivos.guardar': 'Guardar objetivo',
  'objetivos.borrar': 'Borrar',
  'objetivos.tipo.SAVINGS_RATE': 'Tasa de ahorro mensual',
  'objetivos.tipo.INVESTMENT_RATE': 'Inversión sobre ingresos',
  'objetivos.tipo.EMERGENCY_FUND': 'Fondo de emergencia',
  'objetivos.tipo.CATEGORY_BUDGET': 'Presupuesto por categoría',
  'objetivos.tipo.DEBT_REDUCTION': 'Reducción de deuda',
  'objetivos.ayuda.SAVINGS_RATE':
    'Qué porcentaje de lo que entra querés que quede sin gastar cada mes.',
  'objetivos.ayuda.INVESTMENT_RATE':
    'Qué porcentaje de tus ingresos querés destinar a inversiones.',
  'objetivos.ayuda.EMERGENCY_FUND':
    'Cuántos meses de tus gastos querés tener cubiertos con plata líquida.',
  'objetivos.ayuda.CATEGORY_BUDGET': 'Techo de gasto mensual para una categoría.',
  'objetivos.ayuda.DEBT_REDUCTION': 'A cuánto querés bajar tu deuda total.',
  'objetivos.unidad.porcentaje': '% de los ingresos',
  'objetivos.unidad.meses': 'meses de gastos',
  'objetivos.unidad.monto': 'monto',

  // --- Tier -----------------------------------------------------------------
  'tier.titulo': 'Tier AUREM',
  'tier.xp': 'XP',
  'tier.siguiente': 'Faltan {xp} XP para {tier}',
  'tier.maximo': 'Llegaste al tier más alto.',
  'tier.comoFunciona':
    'Cada objetivo que cumplís por primera vez suma XP, y el XP no baja nunca. Un mes flojo no te saca un logro que ya conseguiste.',
} as const

export type Clave = keyof typeof ES_AR

/** Traducciones parciales: lo que falte cae a es-AR. */
type Parcial = Partial<Record<Clave, string>>

const ES_NEUTRO: Parcial = {
  'nav.deudasDetalle': 'Lo que debes y lo que te deben',
  'nav.gastoInteligenteDetalle': 'Contado con descuento o en cuotas',
  'nav.guiaDetalle': 'Cómo aprovechar AUREM',
  'nav.objetivosDetalle': 'Tus metas y los logros que desbloqueas',

  'ajustes.idiomaAyuda':
    'Cambia el texto de la app. La región, que define el formato de números y fechas, se elige por separado.',

  'localizacion.cuerpo':
    'La interfaz, los formatos y las guías de uso se actualizarán a {destino}.',

  'objetivos.bajada':
    'Metas con número. Cada una que cumples suma XP y sube tu Tier: aquí no se penaliza el gasto, se reconoce el logro.',
  'objetivos.sinObjetivos': 'Aún no has definido ninguna meta.',
  'objetivos.ayuda.SAVINGS_RATE':
    'Qué porcentaje de tus ingresos quieres que quede sin gastar cada mes.',
  'objetivos.ayuda.INVESTMENT_RATE':
    'Qué porcentaje de tus ingresos quieres destinar a inversiones.',
  'objetivos.ayuda.EMERGENCY_FUND':
    'Cuántos meses de tus gastos quieres tener cubiertos con dinero líquido.',
  'objetivos.ayuda.DEBT_REDUCTION': 'A cuánto quieres reducir tu deuda total.',

  'tier.comoFunciona':
    'Cada objetivo que cumples por primera vez suma XP, y el XP nunca baja. Un mes flojo no te quita un logro que ya conseguiste.',
}

const EN: Parcial = {
  'nav.inicio': 'Home',
  'nav.cuentas': 'Accounts',
  'nav.movimientos': 'Transactions',
  'nav.inversiones': 'Investments',
  'nav.mas': 'More',
  'nav.masSecciones': 'More sections',
  'nav.fire': 'FIRE calculator',
  'nav.fireDetalle': 'How far you are from living off your investments',
  'nav.calendario': 'Calendar',
  'nav.calendarioDetalle': 'Statement closings and due dates',
  'nav.deudas': 'Debts and loans',
  'nav.deudasDetalle': 'What you owe and what you are owed',
  'nav.gastoInteligente': 'Smart spending',
  'nav.gastoInteligenteDetalle': 'Cash discount or instalments',
  'nav.consolidado': 'Consolidated view',
  'nav.consolidadoDetalle': 'All your currencies in a single total',
  'nav.guia': 'User guide',
  'nav.guiaDetalle': 'How to get the most out of AUREM',
  'nav.ajustes': 'Settings and profile',
  'nav.ajustesDetalle': 'Currencies, region, budgets and account',
  'nav.objetivos': 'Goals and AUREM Tier',
  'nav.objetivosDetalle': 'Your targets and the badges you unlock',

  'ajustes.idioma': 'Interface language',
  'ajustes.idiomaAyuda':
    'Changes the app text. The region, which sets number and date formats, is chosen separately.',
  'ajustes.region': 'Region and format',
  'ajustes.guardando': 'Saving…',
  'ajustes.guardado': 'Saved',

  'localizacion.titulo': 'Confirm localisation change?',
  'localizacion.cuerpo': 'The interface, formats and user guides will switch to {destino}.',
  'localizacion.confirmar': 'Confirm',
  'localizacion.cancelar': 'Cancel',

  'objetivos.titulo': 'Goals',
  'objetivos.bajada':
    'Targets with a number. Each one you hit earns XP and raises your Tier: nothing here penalises spending, it recognises achievement.',
  'objetivos.nuevo': 'New goal',
  'objetivos.sinObjetivos': "You haven't set any targets yet.",
  'objetivos.logrado': 'Achieved',
  'objetivos.enProgreso': 'In progress',
  'objetivos.meta': 'Target',
  'objetivos.actual': 'Current',
  'objetivos.guardar': 'Save goal',
  'objetivos.borrar': 'Delete',
  'objetivos.tipo.SAVINGS_RATE': 'Monthly savings rate',
  'objetivos.tipo.INVESTMENT_RATE': 'Investment share of income',
  'objetivos.tipo.EMERGENCY_FUND': 'Emergency fund',
  'objetivos.tipo.CATEGORY_BUDGET': 'Category budget',
  'objetivos.tipo.DEBT_REDUCTION': 'Debt reduction',
  'objetivos.ayuda.SAVINGS_RATE': 'What share of your income you want left unspent each month.',
  'objetivos.ayuda.INVESTMENT_RATE': 'What share of your income you want to put into investments.',
  'objetivos.ayuda.EMERGENCY_FUND':
    'How many months of expenses you want covered by liquid money.',
  'objetivos.ayuda.CATEGORY_BUDGET': 'Monthly spending ceiling for a category.',
  'objetivos.ayuda.DEBT_REDUCTION': 'The level you want to bring your total debt down to.',
  'objetivos.unidad.porcentaje': '% of income',
  'objetivos.unidad.meses': 'months of expenses',
  'objetivos.unidad.monto': 'amount',

  'tier.titulo': 'AUREM Tier',
  'tier.xp': 'XP',
  'tier.siguiente': '{xp} XP to {tier}',
  'tier.maximo': "You've reached the highest tier.",
  'tier.comoFunciona':
    'Every goal you hit for the first time earns XP, and XP never goes down. A weak month cannot take away something you already achieved.',
}

const DICCIONARIOS: Record<Idioma, Parcial> = {
  'es-AR': {},
  es: ES_NEUTRO,
  en: EN,
}

/**
 * Traduce una clave, con interpolación de `{variables}`.
 *
 * Cae a es-AR cuando falta la traducción, y a la clave misma si tampoco está
 * ahí: una cadena sin traducir se ve rara, pero una pantalla en blanco por un
 * `undefined` es un bug.
 */
export function traducir(
  idioma: Idioma,
  clave: Clave,
  variables?: Record<string, string | number>
): string {
  const texto = DICCIONARIOS[idioma]?.[clave] ?? ES_AR[clave] ?? clave

  if (!variables) return texto

  return Object.entries(variables).reduce(
    (acumulado, [nombre, valor]) => acumulado.replaceAll(`{${nombre}}`, String(valor)),
    texto
  )
}

export type Traductor = (clave: Clave, variables?: Record<string, string | number>) => string

/** El traductor atado a un idioma, para no pasarlo en cada llamada. */
export function crearTraductor(idioma: Idioma): Traductor {
  return (clave, variables) => traducir(idioma, clave, variables)
}
