import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, BookOpen, Coins, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Guía de uso' }

/**
 * Las herramientas, en su forma larga.
 *
 * Antes esta lista salía de `CAPACIDADES`, el mismo array que alimenta el
 * carrusel del dashboard. Se separó porque las dos cosas dejaron de decir lo
 * mismo: el carrusel muestra cuatro tarjetas en una tira horizontal —tiene que
 * ser corto— y la guía necesita explicar siete funciones con el detalle
 * suficiente para entenderlas sin probarlas. Compartir la fuente obligaba a
 * que el manual fuera tan breve como una tarjeta.
 */
const HERRAMIENTAS = [
  {
    emoji: '➕',
    titulo: 'Registro por IA: el botón flotante',
    href: '/dashboard',
    detalle:
      'El botón dorado de abajo a la derecha abre tres formas de cargar un gasto sin salir de donde estés. "Nuevo movimiento" te deja escribirlo o dictarlo en lenguaje natural: decí "gasté 15 lucas en el súper con la Visa" y la IA arma el importe, la categoría, la fecha y la cuenta. "Tomar foto" abre la cámara para un ticket, y "Subir documento" acepta imágenes y PDF. En los tres casos ves el borrador antes de guardar: la IA propone, vos confirmás.',
  },
  {
    emoji: '💳',
    titulo: 'Optimizador de tarjetas',
    href: '/dashboard/accounts',
    detalle:
      'Cada tarjeta cierra un día distinto. Comprar justo después del cierre mete el gasto en un resumen que recién vencés el mes que viene: son hasta 40 días de financiación sin interés. La app compara tus tarjetas y te dice con cuál pagás lo más tarde posible, descartando las que no tienen cupo. Para que funcione hay que cargar el día de cierre y el de vencimiento de cada una.',
  },
  {
    emoji: '💡',
    titulo: 'Gasto inteligente: contado o cuotas',
    href: '/dashboard/smart-spend',
    detalle:
      'La comparación NO se hace mirando los dos totales, porque es plata en momentos distintos: mil pesos hoy valen más que mil pesos dentro de un año. Las cuotas se traen a valor presente descontando a la tasa que REALMENTE rinde tu plata líquida, que sale de tus inversiones T+0 y T+1. Si el descuento por pagar contado supera lo que ganarías dejando la plata invertida, conviene contado; si no, conviene financiar. Te dice la opción ganadora, cuánto ahorrás y a partir de qué tasa se da vuelta.',
  },
  {
    emoji: '📈',
    titulo: 'Inversiones y liquidez T+0 / T+1',
    href: '/dashboard/investments',
    detalle:
      'Cargá tus fondos, plazos fijos y CEDEARs con su plazo de rescate. T+0 se acredita el mismo día —una billetera virtual con fondo money market—, T+1 al hábil siguiente, y LOCKED es plata inmovilizada. Esa distinción es la que alimenta al gasto inteligente: un plazo fijo a 90 días no puede respaldar una compra de hoy, así que no entra en la tasa. Mantener el valor actual al día es lo que hace que el patrimonio y las recomendaciones sirvan.',
  },
  {
    emoji: '🌎',
    titulo: 'Divisas dinámicas y vista consolidada',
    href: '/dashboard/consolidated',
    detalle:
      'Elegís con qué divisas trabajás y cada una es un libro aparte: nunca se suman entre sí, porque un total que mezcla pesos con dólares no representa nada estable cuando una de las dos se devalúa. El selector del header cambia el libro activo y filtra todo. La vista consolidada es la única excepción: ahí sí se suman, convertidas a tu divisa principal, con el tipo de cambio y la fecha siempre a la vista.',
  },
  {
    emoji: '🚀',
    titulo: 'Calculadora FIRE',
    href: '/dashboard/fire',
    detalle:
      'Con tu tasa de ahorro y tu patrimonio actual, proyecta en cuántos años tus inversiones cubren tus gastos. Usa la regla del 4%: el capital objetivo es tu gasto anual dividido 0,04. Sirve sobre todo para ver el efecto real de subir un punto la tasa de ahorro, que suele mover más el resultado que cualquier rendimiento extra.',
  },
  {
    emoji: '📅',
    titulo: 'Calendario y saldo comprometido',
    href: '/dashboard/commitments',
    detalle:
      'Un plan en 6 cuotas genera 6 movimientos reales, uno por mes, con su fecha de imputación. Por eso la curva de desendeudamiento a 12 meses no es una estimación: son los movimientos que ya están cargados. El calendario suma los cierres y vencimientos de tarjeta para que no te agarren de sorpresa.',
  },
] as const

/** Cosas que conviene entender una vez y valen para toda la app. */
const CONCEPTOS = [
  {
    titulo: 'Cada divisa es un libro paralelo',
    cuerpo:
      'Nunca se suman entre sí: un total mezclado no representa nada. El selector del header elige en qué libro estás y filtra cuentas, movimientos, tarjetas y presupuestos. Para verlos juntos está la vista consolidada, que muestra siempre con qué cotización y de qué fecha se unificó.',
  },
  {
    titulo: 'La tarjeta es una cuenta más',
    cuerpo:
      'Un gasto con tarjeta se registra CONTRA la tarjeta, así que nunca toca el saldo del banco: el saldo de la tarjeta se vuelve negativo y ese negativo es tu deuda. Cuando pagás el resumen, ahí sí se mueve la plata del banco.',
  },
  {
    titulo: 'Las cuotas son filas de verdad',
    cuerpo:
      'No hay una "deuda" abstracta: hay N movimientos fechados. Por eso el calendario, el saldo comprometido y la curva de 12 meses coinciden entre sí — todos leen las mismas filas.',
  },
  {
    titulo: 'El equivalente en USD se congela',
    cuerpo:
      'Cada movimiento guarda su equivalente en dólares con la cotización del día en que lo cargaste. Con la inflación argentina, reconvertir el histórico con la cotización de hoy falsearía todo.',
  },
  {
    titulo: 'La región cambia el formato, no los datos',
    cuerpo:
      'Elegir Argentina, España o Estados Unidos en Ajustes cambia cómo se ESCRIBEN los importes y las fechas. No convierte nada: un gasto en pesos sigue siendo un gasto en pesos. Importa más de lo que parece — 10/09 es el 10 de septiembre para unos y el 9 de octubre para otros.',
  },
] as const

const NIVELES = [
  { nombre: 'Aurem Base', rango: 'menos del 15%', gold: false },
  { nombre: 'Aurem Silver Tier', rango: 'del 15% al 29%', gold: false },
  { nombre: 'Aurem Gold Tier', rango: '30% o más', gold: true },
] as const

export default async function GuidePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-lg font-bold tracking-tight text-on-background">
          Guía de uso
        </h1>
        <p className="text-xs leading-snug text-subtle">
          Las herramientas que hacen la diferencia, y los conceptos que conviene tener claros para
          leer bien los números.
        </p>
      </div>

      {/* --- Nivel AUREM: lo que más se pregunta ------------------------- */}
      <Card glass className="glow-gold flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2.5">
          <span className="fire-gradient glow-gold grid size-8 shrink-0 place-items-center rounded-xl text-midnight-navy">
            <Trophy className="size-4" aria-hidden />
          </span>
          <h2 className="font-display text-sm font-bold tracking-tight text-gold-leaf">
            El nivel AUREM y el % ahorrado
          </h2>
        </div>

        <p className="text-xs leading-relaxed text-on-surface-variant">
          La barra dorada del header no es un puntaje inventado ni una configuración: es tu{' '}
          <strong className="text-on-background">tasa de ahorro real del mes</strong>, y se
          recalcula con cada movimiento que cargás.
        </p>

        <div className="rounded-xl border border-glass-stroke/50 bg-charcoal/40 p-3">
          <p className="text-center font-mono text-[11px] leading-relaxed text-gold-leaf">
            (Ingresos − Gastos) ÷ Ingresos × 100
          </p>
        </div>

        <p className="text-xs leading-relaxed text-on-surface-variant">
          Si este mes entraron $1.000.000 y gastaste $700.000, tu tasa es del 30%. Se calcula sobre
          el libro en pesos, que es el principal; si no hubo ingresos en pesos, prueba con las
          otras divisas que tengas. Sin ingresos cargados la tasa no está definida y la barra no
          aparece — no es un cero, es un dato que falta.
        </p>

        <ul className="flex flex-col gap-1.5">
          {NIVELES.map(({ nombre, rango, gold }) => (
            <li key={nombre} className="flex items-center justify-between gap-3">
              <span
                className={`aurem-caps shrink-0 rounded-full px-2.5 py-1 text-[9px] ${
                  gold
                    ? 'fire-gradient glow-gold text-midnight-navy'
                    : 'border border-glass-stroke text-gold-leaf/80'
                }`}
              >
                {nombre}
              </span>
              <span className="text-[11px] tabular-nums text-subtle">{rango}</span>
            </li>
          ))}
        </ul>

        <p className="text-[11px] leading-relaxed text-subtle">
          El 30% del Gold Tier no es arbitrario: es la tasa a la que el capital empieza a crecer lo
          bastante rápido como para que la independencia financiera deje de ser una idea y pase a
          tener fecha. Subir un punto la tasa de ahorro mueve más ese horizonte que casi cualquier
          rendimiento extra que puedas conseguir.
        </p>
      </Card>

      {/* --- Las herramientas, en su forma larga -------------------------- */}
      <section className="flex flex-col gap-3">
        <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">Herramientas</h2>

        {HERRAMIENTAS.map((herramienta) => (
          <Card key={herramienta.titulo} glass className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2.5">
              <span className="text-xl leading-none" aria-hidden>
                {herramienta.emoji}
              </span>
              <h3 className="font-display text-sm font-bold tracking-tight text-gold-leaf">
                {herramienta.titulo}
              </h3>
            </div>

            <p className="text-xs leading-relaxed text-on-surface-variant">{herramienta.detalle}</p>

            <Link
              href={herramienta.href}
              className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-gold-leaf hover:underline"
            >
              Ir a la herramienta
              <ArrowRight className="size-3" aria-hidden />
            </Link>
          </Card>
        ))}
      </section>

      {/* --- Conceptos del modelo de datos ------------------------------- */}
      <section className="flex flex-col gap-3">
        <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">Cómo piensa AUREM</h2>

        <Card className="flex flex-col divide-y divide-border p-0">
          {CONCEPTOS.map((concepto) => (
            <div key={concepto.titulo} className="flex flex-col gap-1.5 p-4">
              <h3 className="flex items-center gap-2 text-xs font-semibold tracking-tight text-on-background">
                <Coins className="size-3.5 shrink-0 text-gold-leaf" aria-hidden />
                {concepto.titulo}
              </h3>
              <p className="text-xs leading-relaxed text-on-surface-variant">{concepto.cuerpo}</p>
            </div>
          ))}
        </Card>
      </section>

      <Card className="flex items-start gap-3 border-dashed p-4">
        <BookOpen className="mt-0.5 size-4 shrink-0 text-gold-leaf" aria-hidden />
        <p className="text-[11px] leading-relaxed text-subtle">
          Un orden que funciona para empezar: cargá tus cuentas y tarjetas con sus días de cierre,
          después tus inversiones líquidas —así el asistente de gasto usa tu tasa real y no una
          estimada— y recién entonces empezá a registrar movimientos con el botón{' '}
          <span className="font-semibold text-gold-leaf">+</span>.
        </p>
      </Card>
    </div>
  )
}
