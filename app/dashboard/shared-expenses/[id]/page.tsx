import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { EspacioEnCliente } from '@/components/vistas/espacio-en-cliente'
import { cargarBaseDelEspacio } from '@/lib/shared-expenses-service'
import { CompartidosSoloBoveda } from '@/components/compartidos-solo-boveda'
import { backendDelUsuario } from '@/lib/almacen/acceso'
import { backendSoportaModulo } from '@/lib/modules'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Grupo' }

/**
 * El grupo, hasta donde el servidor puede llegar.
 *
 * Lee lo que sí puede leer —el nombre del grupo y quiénes son— y con eso
 * resuelve las tres decisiones que conviene tomar antes de pintar nada: si el
 * grupo existe, si el que entra es miembro, y con qué nombre mostrar a cada
 * uno. Los gastos no aparecen acá y no es una optimización: están cifrados con
 * la llave del grupo, que sólo existe en el navegador de un miembro.
 */
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

  // Sin Bóveda no hay llave personal, y sin llave personal no hay llave de
  // grupo. La sección existe igual: se explica en vez de desaparecer.
  const backend = await backendDelUsuario(supabase, user.id)
  if (!backendSoportaModulo(backend, 'shared_expenses')) return <CompartidosSoloBoveda />

  const { espacio, miembros, generacion, error } = await cargarBaseDelEspacio(supabase, id)

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
  const miMiembro = miembros.find((m) => m.user_id === user.id)
  if (!miMiembro) redirect(`/dashboard/shared-expenses/join/${id}`)

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

      <EspacioEnCliente
        espacio={espacio}
        miembros={miembros}
        generacion={generacion}
        miMiembroId={miMiembro.id}
        soyElCreador={espacio.created_by === user.id}
        soyAdmin={miMiembro.role === 'ADMIN'}
        userId={user.id}
        nombres={nombres}
      />
    </div>
  )
}
