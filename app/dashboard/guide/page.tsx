import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, BookOpen, Coins, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { contenidoDeGuia } from '@/lib/guide-content'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Guía de uso' }

/**
 * Manual de la app, en el idioma del usuario.
 *
 * El contenido vive en `lib/guide-content.ts` y no acá: son tres versiones
 * completas, y la argentina no es el origen de las otras dos. Ver la nota de
 * ese archivo — el neutro y el inglés no mencionan MEP, inflación local ni
 * cierres de tarjeta argentinos, porque no son el problema de quien los lee.
 */
export default async function GuidePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { idioma } = await cargarContextoDeMonedas()
  const guia = contenidoDeGuia(idioma)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-lg font-bold tracking-tight text-on-background">
          {guia.titulo}
        </h1>
        <p className="text-xs leading-snug text-subtle">{guia.bajada}</p>
      </div>

      {/* --- Tier: lo que más se pregunta -------------------------------- */}
      <Card glass className="glow-gold flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2.5">
          <span className="fire-gradient glow-gold grid size-8 shrink-0 place-items-center rounded-xl text-midnight-navy">
            <Trophy className="size-4" aria-hidden />
          </span>
          <h2 className="font-display text-sm font-bold tracking-tight text-gold-leaf">
            {guia.tierTitulo}
          </h2>
        </div>

        <p className="text-xs leading-relaxed text-on-surface-variant">{guia.tierIntro}</p>

        <div className="rounded-xl border border-glass-stroke/50 bg-charcoal/40 p-3">
          <p className="text-center font-mono text-[11px] leading-relaxed text-gold-leaf">
            {guia.tierFormula}
          </p>
        </div>

        <p className="text-xs leading-relaxed text-on-surface-variant">{guia.tierEjemplo}</p>

        <ul className="flex flex-col gap-1.5">
          {guia.niveles.map(({ nombre, rango, gold }) => (
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

        <p className="text-[11px] leading-relaxed text-subtle">{guia.tierCierre}</p>

        <Link
          href="/dashboard/goals"
          className="btn-gold-subtle w-full justify-center rounded-xl px-3 py-2 text-[11px] font-semibold"
        >
          {guia.herramientas[0]?.titulo}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </Card>

      {/* --- Las herramientas, en su forma larga -------------------------- */}
      <section className="flex flex-col gap-3">
        <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
          {guia.seccionHerramientas}
        </h2>

        {guia.herramientas.map((herramienta) => (
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
              {herramienta.titulo}
              <ArrowRight className="size-3" aria-hidden />
            </Link>
          </Card>
        ))}
      </section>

      {/* --- Conceptos del modelo de datos ------------------------------- */}
      <section className="flex flex-col gap-3">
        <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
          {guia.seccionConceptos}
        </h2>

        <Card className="flex flex-col divide-y divide-border p-0">
          {guia.conceptos.map((concepto) => (
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
        <p className="text-[11px] leading-relaxed text-subtle">{guia.cierre}</p>
      </Card>
    </div>
  )
}
