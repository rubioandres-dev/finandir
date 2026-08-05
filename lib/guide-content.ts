import type { Idioma } from './i18n'

/**
 * Contenido de la guía de uso, por idioma.
 *
 * POR QUÉ NO ESTÁ EN `lib/i18n.ts`
 *
 * El diccionario general son etiquetas de una línea. Esto son párrafos, y
 * mezclarlos haría ilegible el archivo que se toca cada vez que se agrega un
 * botón. Además la guía no se traduce frase por frase: se REESCRIBE.
 *
 * ES-AR NO ES EL ORIGEN DE LOS OTROS DOS
 *
 * La versión argentina habla de dólar MEP, de días de cierre de tarjeta y de
 * inflación porque son el problema real de quien la usa acá. Traducir eso
 * literalmente al inglés daría un manual sobre un país que el lector no
 * habita. Las versiones neutra e inglesa dicen lo mismo a nivel de mecánica
 * —valor presente, liquidez, libros por divisa— sin las referencias locales.
 */

export type Herramienta = {
  emoji: string
  titulo: string
  href: string
  detalle: string
}

export type Concepto = { titulo: string; cuerpo: string }

export type Nivel = { nombre: string; rango: string; gold: boolean }

export type ContenidoDeGuia = {
  titulo: string
  bajada: string
  tierTitulo: string
  tierIntro: string
  tierFormula: string
  tierEjemplo: string
  tierCierre: string
  niveles: Nivel[]
  seccionHerramientas: string
  seccionConceptos: string
  herramientas: Herramienta[]
  conceptos: Concepto[]
  cierre: string
}

const ES_AR: ContenidoDeGuia = {
  titulo: 'Guía de uso',
  bajada:
    'Las herramientas que hacen la diferencia, y los conceptos que conviene tener claros para leer bien los números.',
  tierTitulo: 'El nivel AUREM y el % ahorrado',
  tierIntro:
    'La barra dorada del header no es un puntaje inventado: el porcentaje es tu tasa de ahorro real del mes, y se recalcula con cada movimiento que cargás. El TIER, en cambio, sale de los objetivos que cumpliste — y ese no baja nunca.',
  tierFormula: '(Ingresos − Gastos) ÷ Ingresos × 100',
  tierEjemplo:
    'Si este mes entraron $1.000.000 y gastaste $700.000, tu tasa es del 30%. Se calcula sobre el libro de tu divisa principal. Sin ingresos cargados la tasa no está definida y no aparece: no es un cero, es un dato que falta.',
  tierCierre:
    'Cada objetivo que cumplís por primera vez suma XP, y el XP no baja nunca. Un mes flojo no te saca un logro que ya conseguiste: acá no se penaliza el gasto, se reconoce lo logrado.',
  niveles: [
    { nombre: 'Bronze', rango: 'desde 0 XP', gold: false },
    { nombre: 'Silver', rango: 'desde 100 XP', gold: false },
    { nombre: 'Gold', rango: 'desde 300 XP', gold: true },
    { nombre: 'Platinum', rango: 'desde 600 XP', gold: false },
    { nombre: 'Black', rango: 'desde 1000 XP', gold: false },
  ],
  seccionHerramientas: 'Herramientas',
  seccionConceptos: 'Cómo piensa AUREM',
  herramientas: [
    {
      emoji: '🎯',
      titulo: 'Objetivos y Tier AUREM',
      href: '/dashboard/goals',
      detalle:
        'Definí metas con número: qué porcentaje querés ahorrar, cuánto invertir sobre lo que entra, cuántos meses de gastos querés tener cubiertos. La app las mide contra tus movimientos reales y, cuando cumplís una por primera vez, sumás XP y subís de tier. El XP es acumulativo: reconoce que lo lograste, no que lo sostenés todos los meses.',
    },
    {
      emoji: '➕',
      titulo: 'Registro por IA: el botón flotante',
      href: '/dashboard',
      detalle:
        'El botón dorado abre tres formas de cargar un gasto sin salir de donde estés. "Nuevo movimiento" te deja escribirlo o dictarlo: decí "gasté 15 lucas en el súper con la Visa" y la IA arma el importe, la categoría, la fecha y la cuenta. "Tomar foto" abre la cámara para un ticket, y "Subir documento" acepta imágenes y PDF. En los tres casos ves el borrador antes de guardar: la IA propone, vos confirmás.',
    },
    {
      emoji: '💳',
      titulo: 'Optimizador de tarjetas',
      href: '/dashboard/accounts',
      detalle:
        'Cada tarjeta cierra un día distinto. Comprar justo después del cierre mete el gasto en un resumen que recién vencés el mes que viene: hasta 40 días de financiación sin interés. La app compara tus tarjetas y te dice con cuál pagás lo más tarde posible, descartando las que no tienen cupo. Hay que cargar el día de cierre y el de vencimiento de cada una.',
    },
    {
      emoji: '💡',
      titulo: 'Gasto inteligente: contado o cuotas',
      href: '/dashboard/smart-spend',
      detalle:
        'La comparación NO se hace mirando los dos totales, porque es plata en momentos distintos. Las cuotas se traen a valor presente descontando a la tasa que REALMENTE rinde tu plata líquida, que sale de tus inversiones T+0 y T+1. Si el descuento por pagar contado supera lo que ganarías dejando la plata invertida, conviene contado. Te dice la opción ganadora, cuánto ahorrás y a partir de qué tasa se da vuelta.',
    },
    {
      emoji: '📈',
      titulo: 'Inversiones y liquidez T+0 / T+1',
      href: '/dashboard/investments',
      detalle:
        'Cargá tus fondos, plazos fijos y CEDEARs con su plazo de rescate. T+0 se acredita el mismo día, T+1 al hábil siguiente, y LOCKED es plata inmovilizada. Esa distinción alimenta al gasto inteligente: un plazo fijo a 90 días no puede respaldar una compra de hoy, así que no entra en la tasa.',
    },
    {
      emoji: '🌎',
      titulo: 'Divisas dinámicas y vista consolidada',
      href: '/dashboard/consolidated',
      detalle:
        'Elegís con qué divisas trabajás y cada una es un libro aparte: nunca se suman entre sí, porque un total que mezcla pesos con dólares no representa nada estable cuando una se devalúa. La vista consolidada es la única excepción: ahí sí se suman, convertidas a tu divisa principal, con el tipo de cambio y la fecha a la vista.',
    },
    {
      emoji: '🚀',
      titulo: 'Calculadora FIRE',
      href: '/dashboard/fire',
      detalle:
        'Con tu tasa de ahorro y tu patrimonio actual, proyecta en cuántos años tus inversiones cubren tus gastos. Usa la regla del 4%: el capital objetivo es tu gasto anual dividido 0,04. Sirve para ver el efecto real de subir un punto la tasa de ahorro.',
    },
  ],
  conceptos: [
    {
      titulo: 'Cada divisa es un libro paralelo',
      cuerpo:
        'Nunca se suman entre sí: un total mezclado no representa nada. El selector del header elige en qué libro estás y filtra cuentas, movimientos, tarjetas y presupuestos.',
    },
    {
      titulo: 'La tarjeta es una cuenta más',
      cuerpo:
        'Un gasto con tarjeta se registra CONTRA la tarjeta, así que nunca toca el saldo del banco: el saldo de la tarjeta se vuelve negativo y ese negativo es tu deuda. Cuando pagás el resumen, ahí sí se mueve la plata del banco.',
    },
    {
      titulo: 'Las cuotas son filas de verdad',
      cuerpo:
        'No hay una "deuda" abstracta: hay N movimientos fechados. Por eso el calendario, el saldo comprometido y la curva de 12 meses coinciden entre sí.',
    },
    {
      titulo: 'El equivalente en USD se congela',
      cuerpo:
        'Cada movimiento guarda su equivalente en dólares con la cotización del día en que lo cargaste. Con la inflación argentina, reconvertir el histórico con la cotización de hoy falsearía todo.',
    },
    {
      titulo: 'La región cambia el formato, no los datos',
      cuerpo:
        'Elegir región en Ajustes cambia cómo se ESCRIBEN los importes y las fechas. No convierte nada. El idioma es una preferencia aparte: podés tener formato argentino y texto en inglés.',
    },
  ],
  cierre:
    'Un orden que funciona para empezar: cargá tus cuentas y tarjetas con sus días de cierre, después tus inversiones líquidas —así el asistente de gasto usa tu tasa real— y recién entonces empezá a registrar movimientos con el botón +.',
}

const ES_NEUTRO: ContenidoDeGuia = {
  ...ES_AR,
  bajada:
    'Las herramientas que hacen la diferencia, y los conceptos que conviene tener claros para leer bien los números.',
  tierIntro:
    'La barra dorada del encabezado no es un puntaje inventado: el porcentaje es tu tasa de ahorro real del mes, y se recalcula con cada movimiento que registras. El TIER, en cambio, proviene de los objetivos que cumpliste, y ese nunca baja.',
  tierEjemplo:
    'Si este mes ingresaron 1.000.000 y gastaste 700.000, tu tasa es del 30%. Se calcula sobre el libro de tu divisa principal. Sin ingresos registrados la tasa no está definida y no aparece: no es un cero, es un dato que falta.',
  tierCierre:
    'Cada objetivo que cumples por primera vez suma XP, y el XP nunca baja. Un mes flojo no te quita un logro que ya conseguiste: aquí no se penaliza el gasto, se reconoce lo logrado.',
  herramientas: [
    {
      emoji: '🎯',
      titulo: 'Objetivos y Tier AUREM',
      href: '/dashboard/goals',
      detalle:
        'Define metas con número: qué porcentaje quieres ahorrar, cuánto invertir sobre tus ingresos, cuántos meses de gastos quieres tener cubiertos. La app las mide contra tus movimientos reales y, cuando cumples una por primera vez, sumas XP y subes de tier. El XP es acumulativo: reconoce que lo lograste, no que lo sostienes todos los meses.',
    },
    {
      emoji: '➕',
      titulo: 'Registro por IA: el botón flotante',
      href: '/dashboard',
      detalle:
        'El botón dorado abre tres formas de registrar un gasto sin salir de donde estás. "Nuevo movimiento" te permite escribirlo o dictarlo en lenguaje natural, y la IA arma el importe, la categoría, la fecha y la cuenta. "Tomar foto" abre la cámara para un recibo, y "Subir documento" acepta imágenes y PDF. En los tres casos ves el borrador antes de guardar: la IA propone, tú confirmas.',
    },
    {
      emoji: '💳',
      titulo: 'Optimizador de tarjetas',
      href: '/dashboard/accounts',
      detalle:
        'Cada tarjeta cierra su período en un día distinto. Comprar justo después del cierre traslada el cargo al siguiente estado de cuenta, lo que puede darte varias semanas adicionales sin interés. La app compara tus tarjetas y te indica con cuál pagas lo más tarde posible, descartando las que no tienen cupo disponible.',
    },
    {
      emoji: '💡',
      titulo: 'Gasto inteligente: contado o a plazos',
      href: '/dashboard/smart-spend',
      detalle:
        'La comparación NO se hace mirando los dos totales, porque es dinero en momentos distintos. Los pagos a plazo se traen a valor presente descontando a la tasa que realmente rinde tu dinero líquido. Si el descuento por pagar de contado supera lo que ganarías manteniendo el dinero invertido, conviene contado. Te indica la opción ganadora, cuánto ahorras y a partir de qué tasa se invierte el resultado.',
    },
    {
      emoji: '📈',
      titulo: 'Inversiones y liquidez inmediata',
      href: '/dashboard/investments',
      detalle:
        'Registra tus fondos y depósitos con su plazo de rescate. T+0 se acredita el mismo día, T+1 al siguiente día hábil, y LOCKED es dinero inmovilizado. Esa distinción alimenta al asistente de gasto: un depósito a 90 días no puede respaldar una compra de hoy, así que no entra en la tasa.',
    },
    {
      emoji: '🌎',
      titulo: 'Divisas dinámicas y vista consolidada',
      href: '/dashboard/consolidated',
      detalle:
        'Eliges con qué divisas trabajas y cada una es un libro independiente: nunca se suman entre sí, porque un total que mezcla monedas distintas no representa una cifra estable. La vista consolidada es la única excepción: ahí sí se suman, convertidas a tu divisa principal, con el tipo de cambio y la fecha a la vista.',
    },
    {
      emoji: '🚀',
      titulo: 'Calculadora FIRE',
      href: '/dashboard/fire',
      detalle:
        'Con tu tasa de ahorro y tu patrimonio actual, proyecta en cuántos años tus inversiones cubren tus gastos. Usa la regla del 4%: el capital objetivo es tu gasto anual dividido entre 0,04. Sirve para ver el efecto real de subir un punto la tasa de ahorro.',
    },
  ],
  conceptos: [
    {
      titulo: 'Cada divisa es un libro paralelo',
      cuerpo:
        'Nunca se suman entre sí: un total mezclado no representa nada. El selector del encabezado elige en qué libro estás y filtra cuentas, movimientos, tarjetas y presupuestos.',
    },
    {
      titulo: 'La tarjeta es una cuenta más',
      cuerpo:
        'Un gasto con tarjeta se registra CONTRA la tarjeta, así que no toca el saldo bancario: el saldo de la tarjeta se vuelve negativo y ese negativo es tu deuda. Al pagar el estado de cuenta, ahí sí se mueve el dinero del banco.',
    },
    {
      titulo: 'Los pagos a plazo son registros reales',
      cuerpo:
        'No hay una "deuda" abstracta: hay N movimientos con fecha. Por eso el calendario, el saldo comprometido y la curva de 12 meses coinciden entre sí.',
    },
    {
      titulo: 'El equivalente en USD se congela',
      cuerpo:
        'Cada movimiento guarda su equivalente en dólares con el tipo de cambio del día en que lo registraste. Recalcular el histórico con la cotización actual distorsionaría la comparación entre períodos.',
    },
    {
      titulo: 'La región cambia el formato, no los datos',
      cuerpo:
        'Elegir región en Ajustes cambia cómo se ESCRIBEN los importes y las fechas. No convierte nada. El idioma es una preferencia aparte.',
    },
  ],
  cierre:
    'Un orden que funciona para empezar: registra tus cuentas y tarjetas con sus fechas de cierre, después tus inversiones líquidas —así el asistente de gasto usa tu tasa real— y recién entonces empieza a registrar movimientos con el botón +.',
}

const EN: ContenidoDeGuia = {
  titulo: 'User guide',
  bajada:
    'The tools that make the difference, and the concepts worth understanding to read the numbers correctly.',
  tierTitulo: 'The AUREM tier and your savings rate',
  tierIntro:
    'The gold bar in the header is not an invented score: the percentage is your real savings rate for the month, recalculated with every transaction you record. The TIER comes from the goals you have met — and that one never goes down.',
  tierFormula: '(Income − Expenses) ÷ Income × 100',
  tierEjemplo:
    'If 10,000 came in this month and you spent 7,000, your rate is 30%. It is calculated on your primary currency book. With no income recorded the rate is undefined and does not appear: it is missing data, not a zero.',
  tierCierre:
    'Every goal you meet for the first time earns XP, and XP never goes down. A weak month cannot take away something you already achieved: nothing here penalises spending, it recognises achievement.',
  niveles: [
    { nombre: 'Bronze', rango: 'from 0 XP', gold: false },
    { nombre: 'Silver', rango: 'from 100 XP', gold: false },
    { nombre: 'Gold', rango: 'from 300 XP', gold: true },
    { nombre: 'Platinum', rango: 'from 600 XP', gold: false },
    { nombre: 'Black', rango: 'from 1000 XP', gold: false },
  ],
  seccionHerramientas: 'Tools',
  seccionConceptos: 'How AUREM thinks',
  herramientas: [
    {
      emoji: '🎯',
      titulo: 'Goals and AUREM Tier',
      href: '/dashboard/goals',
      detalle:
        'Set targets with a number: what share of your income you want to save, how much to invest, how many months of expenses you want covered. The app measures them against your real transactions, and the first time you hit one you earn XP and move up a tier. XP is cumulative: it recognises that you achieved it, not that you sustain it every month.',
    },
    {
      emoji: '➕',
      titulo: 'AI capture: the floating button',
      href: '/dashboard',
      detalle:
        'The gold button opens three ways to record an expense without leaving the screen you are on. "New transaction" lets you type or dictate it in plain language, and the AI fills in the amount, category, date and account. "Take a photo" opens the camera for a receipt, and "Upload document" accepts images and PDFs. In all three cases you see the draft before saving: the AI proposes, you confirm.',
    },
    {
      emoji: '💳',
      titulo: 'Card optimiser',
      href: '/dashboard/accounts',
      detalle:
        'Each card closes its billing period on a different day. Buying just after the closing date pushes the charge onto the next statement, which can buy you several extra interest-free weeks. The app compares your cards and tells you which one pays latest, ruling out those without available credit.',
    },
    {
      emoji: '💡',
      titulo: 'Smart spending: cash or instalments',
      href: '/dashboard/smart-spend',
      detalle:
        'The comparison is NOT made by looking at the two totals, because that is money at different points in time. Instalments are brought to present value, discounted at the rate your liquid money actually earns. If the cash discount beats what you would earn by keeping the money invested, pay cash. It tells you the winning option, how much you save, and the rate at which the answer flips.',
    },
    {
      emoji: '📈',
      titulo: 'Investments and same-day liquidity',
      href: '/dashboard/investments',
      detalle:
        'Record your funds and deposits with their settlement term. T+0 settles the same day, T+1 the next business day, and LOCKED is money you cannot touch. That distinction feeds the spending assistant: a 90-day deposit cannot back a purchase you make today, so it does not count towards the rate.',
    },
    {
      emoji: '🌎',
      titulo: 'Dynamic currencies and consolidated view',
      href: '/dashboard/consolidated',
      detalle:
        'You choose which currencies you work with, and each one is a separate book: they are never added together, because a total mixing currencies is not a stable figure. The consolidated view is the only exception — there they are summed, converted to your primary currency, with the exchange rate and its date always in sight.',
    },
    {
      emoji: '🚀',
      titulo: 'FIRE calculator',
      href: '/dashboard/fire',
      detalle:
        'From your savings rate and current net worth, it projects how many years until your investments cover your expenses. It uses the 4% rule: the target capital is your annual spending divided by 0.04. It is most useful for seeing the real effect of raising your savings rate by one point.',
    },
  ],
  conceptos: [
    {
      titulo: 'Each currency is a parallel book',
      cuerpo:
        'They are never added together: a mixed total means nothing. The header selector picks which book you are in and filters accounts, transactions, cards and budgets.',
    },
    {
      titulo: 'A card is just another account',
      cuerpo:
        'A card purchase is recorded AGAINST the card, so it never touches your bank balance: the card balance goes negative, and that negative is your debt. Paying the statement is what moves money out of the bank.',
    },
    {
      titulo: 'Instalments are real rows',
      cuerpo:
        'There is no abstract "debt": there are N dated transactions. That is why the calendar, the committed balance and the 12-month curve always agree.',
    },
    {
      titulo: 'The USD equivalent is frozen',
      cuerpo:
        'Each transaction stores its dollar equivalent at the exchange rate of the day you recorded it. Recomputing history at today’s rate would distort any comparison between periods.',
    },
    {
      titulo: 'Region changes the format, not the data',
      cuerpo:
        'Choosing a region in Settings changes how amounts and dates are WRITTEN. It converts nothing. Language is a separate preference.',
    },
  ],
  cierre:
    'An order that works to get started: add your accounts and cards with their closing dates, then your liquid investments —so the spending assistant uses your real rate— and only then start recording transactions with the + button.',
}

const CONTENIDOS: Record<Idioma, ContenidoDeGuia> = {
  'es-AR': ES_AR,
  es: ES_NEUTRO,
  en: EN,
}

export function contenidoDeGuia(idioma: Idioma): ContenidoDeGuia {
  return CONTENIDOS[idioma] ?? ES_AR
}
