import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { SharedSpaceDetail } from '@/components/shared-space-detail'
import {
  calcularBalances,
  calcularLiquidacion,
  cargarEspacio,
} from '@/lib/shared-expenses-service'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Grupo' }

export default async function SharedSpacePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { espacio, miembros, gastos, error } = await cargarEspacio(supabase, id)

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-2xl border border-budget-warn/30 bg-budget-warn/10 px-4 py-3 text-sm text-budget-warn"
      >
        {error}
      </p>
    )
  }

  if (!espacio) notFound()

  // Sin membresía, RLS ya oculta los gastos: mandarlo a la pantalla de unirse
  // es más útil que mostrarle un grupo vacío que no entiende.
  if (!miembros.some((m) => m.user_id === user.id)) {
    redirect(`/dashboard/shared-expenses/join/${id}`)
  }

  const ids = miembros.map((m) => m.user_id)
  const balances = calcularBalances(gastos, ids)
  const liquidacion = calcularLiquidacion(balances)

  /**
   * Nombres para mostrar.
   *
   * `auth.users` no es consultable desde el cliente y `user_profiles` sólo deja
   * leer la fila propia: por RLS, acá sólo puede resolverse el nombre del
   * usuario actual. Para el resto se usa el alias que hayan puesto al entrar al
   * grupo, y si no hay, un genérico. Resolver los nombres reales pediría una
   * vista `security definer` que exponga display_name a los miembros del mismo
   * espacio — es la mejora natural, y no está.
   */
  const nombres: Record<string, string> = {}
  for (const [indice, miembro] of miembros.entries()) {
    nombres[miembro.user_id] =
      miembro.user_id === user.id
        ? 'Vos'
        : (miembro.alias ?? `Integrante ${indice + 1}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/shared-expenses"
          aria-label="Volver"
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-glass-stroke/50 text-on-surface-variant transition hover:border-gold-leaf/60 hover:text-gold-leaf"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <h1 className="min-w-0 truncate font-display text-lg font-bold tracking-tight text-on-background">
          {espacio.name}
        </h1>
      </div>

      <SharedSpaceDetail
        espacio={espacio}
        miembros={miembros}
        gastos={gastos}
        balances={balances}
        liquidacion={liquidacion}
        nombres={nombres}
        usuarioId={user.id}
      />
    </div>
  )
}
