import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, BookOpen, Coins } from 'lucide-react'
import { CAPACIDADES } from '@/components/guide-carousel'
import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Guía de uso' }

/** Cosas que conviene entender una vez y valen para toda la app. */
const CONCEPTOS = [
  {
    titulo: 'ARS y USD son libros paralelos',
    cuerpo:
      'Los pesos y los dólares nunca se suman entre sí: un total mezclado no representa nada. El toggle del header elige en qué libro estás trabajando y filtra cuentas, movimientos, tarjetas y presupuestos. Para verlos juntos, convertidos al MEP del día, está la vista consolidada.',
  },
  {
    titulo: 'La tarjeta es una cuenta más',
    cuerpo:
      'Un gasto con tarjeta se registra CONTRA la tarjeta, así que nunca toca el saldo del banco: el saldo de la tarjeta se vuelve negativo y ese negativo es tu deuda. Cuando pagás el resumen, ahí sí se mueve la plata del banco.',
  },
  {
    titulo: 'Las cuotas son filas de verdad',
    cuerpo:
      'Un plan en 6 cuotas genera 6 movimientos, uno por mes, con su fecha real de imputación. Por eso el calendario y el saldo comprometido saben lo que viene: no es una estimación, son los movimientos ya cargados.',
  },
  {
    titulo: 'El equivalente en USD se congela',
    cuerpo:
      'Cada movimiento guarda su equivalente en dólares con la cotización del día en que lo cargaste. Con la inflación argentina, reconvertir el histórico con la cotización de hoy falsearía todo.',
  },
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
          Las cuatro herramientas que hacen la diferencia, y los cuatro conceptos que conviene
          tener claros para leer bien los números.
        </p>
      </div>

      {/* --- Las capacidades, en su forma larga -------------------------- */}
      <section className="flex flex-col gap-3">
        <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">Herramientas</h2>

        {CAPACIDADES.map((capacidad) => (
          <Card key={capacidad.titulo} glass className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2.5">
              <span className="text-xl leading-none" aria-hidden>
                {capacidad.emoji}
              </span>
              <h3 className="font-display text-sm font-bold tracking-tight text-gold-leaf">
                {capacidad.titulo}
              </h3>
            </div>

            <p className="text-xs leading-relaxed text-on-surface-variant">{capacidad.detalle}</p>

            <Link
              href={capacidad.href}
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
        <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
          Cómo piensa Finandir
        </h2>

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
          estimada— y recién entonces empezá a registrar movimientos con el Smart Input.
        </p>
      </Card>
    </div>
  )
}
