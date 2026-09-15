import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { User } from 'lucide-react'
import { ProfileForm } from '@/components/profile-form'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { crearTraductor } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { backendDelUsuario } from '@/lib/almacen/acceso'

export const metadata: Metadata = { title: 'Perfil' }

/**
 * PERFIL — quién sos
 * =============================================================================
 *
 * Se separó de Ajustes porque eran dos cosas distintas amontonadas: tus datos
 * personales y cómo se comporta la app. Una la tocás una vez por año, la otra
 * cada tanto, y buscarlas en la misma lista larga hacía que las dos costaran.
 *
 * Acá vive lo que es TUYO: nombre, email y contraseña. Lo demás —divisas,
 * región, módulos, dónde se guardan los datos— está en Configuración.
 */
export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { idioma, perfil } = await cargarContextoDeMonedas()
  const tr = crearTraductor(idioma)
  const backend = await backendDelUsuario(supabase, user.id)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-on-background">
        <User className="size-5 text-gold-leaf" aria-hidden />
        {tr('nav.perfil')}
      </h1>

      <ProfileForm
        email={user.email ?? ''}
        nombre={
          perfil?.display_name ??
          (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '')
        }
        backend={backend}
      />
    </div>
  )
}
