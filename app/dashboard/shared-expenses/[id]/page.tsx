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

  const { espacio, miembros, gastos, liquidaciones, objetivos, error } = await cargarEspacio(
    supabase,
    id
  )

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

  // Los saldos se calculan por MIEMBRO y ya netos de las liquidaciones: un pago
  // registrado entra al balance como un movimiento más.
  const balances = calcularBalances(
    gastos,
    miembros.map((m) => m.id),
    liquidaciones
  )
  const liquidacion = calcularLiquidacion(balances)

  /**
   * Nombres para mostrar, resueltos por fin sin rodeos.
   *
   * Acá había una nota diciendo que sólo se podía resolver el nombre del usuario
   * actual: `auth.users` no es consultable desde el cliente y `user_profiles`
   * sólo deja leer la fila propia, así que el resto caía a "Integrante 2". La
   * 015 lo resuelve copiando `display_name` a la fila del miembro, que sí es
   * legible por todo el grupo. La vista `security definer` que aquella nota
   * proponía dejó de hacer falta.
   */
  const nombres: Record<string, string> = {}
  for (const miembro of miembros) {
    nombres[miembro.id] = miembro.user_id === user.id ? 'Vos' : miembro.display_name
  }

  const miMiembroId = miembros.find((m) => m.user_id === user.id)?.id ?? null

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
        liquidaciones={liquidaciones}
        objetivos={objetivos}
        balances={balances}
        liquidacion={liquidacion}
        nombres={nombres}
        miMiembroId={miMiembroId}
      />
    </div>
  )
}
