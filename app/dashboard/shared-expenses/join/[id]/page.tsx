import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Users } from 'lucide-react'
import { JoinSpace } from '@/components/join-space'
import { Card, CardLabel } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Unirse al grupo' }

/**
 * Destino del QR de invitación.
 *
 * Es una página propia y no un `?join=` sobre el listado porque el QR codifica
 * una URL que se abre desde la cámara del sistema: tiene que ser un enlace
 * legible que, si el usuario no tiene sesión, pase por /login y vuelva acá.
 *
 * El SELECT de `shared_spaces` está abierto a cualquier autenticado justamente
 * para que esta pantalla pueda mostrar el nombre del grupo ANTES de entrar.
 * Los gastos siguen cerrados a los miembros.
 */
export default async function JoinSpacePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirectTo=/dashboard/shared-expenses/join/${id}`)

  const [{ data: espacio }, { data: membresia }] = await Promise.all([
    supabase.from('shared_spaces').select('id, name, type, currency').eq('id', id).maybeSingle(),
    supabase
      .from('shared_space_members')
      .select('user_id')
      .eq('space_id', id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (!espacio) notFound()

  return (
    <div className="flex flex-col gap-5">
      <Card glass className="glow-gold flex flex-col gap-3 p-5">
        <CardLabel className="text-gold-leaf">
          <Users className="size-3.5" aria-hidden />
          Invitación
        </CardLabel>

        <p className="font-display text-xl font-bold tracking-tight text-on-background">
          {espacio.name as string}
        </p>
        <p className="text-[11px] text-subtle">{espacio.currency as string}</p>

        <div className="fire-gradient h-px w-full opacity-40" aria-hidden />

        <JoinSpace spaceId={id} yaEsMiembro={Boolean(membresia)} />
      </Card>
    </div>
  )
}
