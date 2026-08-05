import Link from 'next/link'
import { ArrowRight, Compass } from 'lucide-react'
import { CardLabel } from '@/components/ui/card'

/**
 * Las cuatro capacidades que no se descubren solas.
 *
 * Vive acá y en /dashboard/guide toma la forma larga: una sola fuente para el
 * título y el pitch de cada una, así el carrusel y el manual no se desfasan.
 */
export const CAPACIDADES = [
  {
    emoji: '🎙️',
    titulo: 'Smart Input por voz',
    pitch: 'Registrá gastos hablando o escribiendo en lenguaje natural.',
    detalle:
      'Decí "gasté 15 lucas en el super" y la IA arma el movimiento: importe, categoría, fecha y cuenta. Podés dictarlo: al hacer una pausa se analiza solo. Siempre te muestra el borrador antes de guardar, así nada entra sin que lo revises.',
    href: '/dashboard',
  },
  {
    emoji: '💳',
    titulo: 'Optimizador de tarjetas',
    pitch: 'Hasta 40 días de financiación gratis, eligiendo bien la tarjeta.',
    detalle:
      'Cada tarjeta cierra un día distinto. Comprar justo después del cierre mete el gasto en un resumen que recién vencés el mes que viene. La app compara tus tarjetas y te dice con cuál pagás lo más tarde posible, descartando las que no tienen cupo.',
    href: '/dashboard/accounts',
  },
  {
    emoji: '💡',
    titulo: 'Gasto inteligente',
    pitch: 'Contado con descuento o cuotas: cuál te deja más plata.',
    detalle:
      'No se compara mirando los dos totales, porque es plata en momentos distintos. Todo se lleva a valor de hoy descontando a la tasa que REALMENTE consigue tu plata líquida. Te dice la opción ganadora, el ahorro y a partir de qué tasa conviene financiar.',
    href: '/dashboard/smart-spend',
  },
  {
    emoji: '🚀',
    titulo: 'Calculadora FIRE',
    pitch: 'Cuánto falta para vivir de tus inversiones.',
    detalle:
      'Con tu tasa de ahorro y tu patrimonio actual, proyecta en cuántos años tus inversiones cubren tus gastos. Sirve para ver el efecto real de subir un punto la tasa de ahorro.',
    href: '/dashboard/fire',
  },
] as const

/**
 * Carrusel compacto de la guía.
 *
 * Scroll horizontal con CSS puro (`snap`) y no con JS: no necesita estado, así
 * que se queda en el servidor y no suma nada al bundle del cliente.
 */
export function GuideCarousel() {
  return (
    // SIN card contenedora, a propósito. Antes las cuatro subcards vivían
    // adentro de una `.glass-card`: vidrio dorado sobre vidrio dorado, con dos
    // bordes concéntricos a 12 px de distancia. El marco de afuera no aportaba
    // nada —el título ya agrupa— y comía ancho justo donde menos sobra.
    <section className="flex h-full flex-col justify-between gap-3">
      <CardLabel>
        <Compass className="size-3.5 text-gold-leaf" aria-hidden />
        Cómo sacarle jugo
      </CardLabel>

      {/* Los márgenes negativos dejan que las subcards lleguen al borde de la
          canaleta al scrollear, sin perder el padding del contenido. */}
      <ul className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1">
        {CAPACIDADES.map((capacidad) => (
          <li key={capacidad.titulo} className="w-[10.5rem] shrink-0 snap-start">
            <Link
              href={capacidad.href}
              className="glass-card flex h-full flex-col gap-1.5 rounded-xl p-3 transition hover:border-gold-leaf/60"
            >
              <span className="text-lg leading-none" aria-hidden>
                {capacidad.emoji}
              </span>
              <span className="text-xs font-semibold leading-tight tracking-tight text-on-background">
                {capacidad.titulo}
              </span>
              <span className="text-[10px] leading-snug text-subtle">{capacidad.pitch}</span>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/dashboard/guide"
        className="btn-gold-subtle w-full justify-center rounded-xl px-3 py-2.5 text-[11px] font-semibold"
      >
        Ver guía completa
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  )
}
