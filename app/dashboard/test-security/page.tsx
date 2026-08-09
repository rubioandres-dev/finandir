import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Lock } from 'lucide-react'
import { SecurityLab } from '@/components/security-lab'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Laboratorio E2EE' }

/**
 * Laboratorio del POC de cifrado en el cliente.
 *
 * La ruta NO está en la barra lateral ni en la bandeja "Más": se llega
 * escribiendo la URL. Es deliberado —agregarla al menú tocaría la navegación
 * compartida, que es lo único de esta rama que después habría que desarmar—, y
 * además todavía no es una función, es un banco de pruebas.
 *
 * El servidor acá no hace nada más que exigir sesión: todo el trabajo pasa en
 * el cliente, y tiene que ser así. Si el cifrado corriera de este lado, el PIN
 * habría pasado por el servidor y el modelo zero-knowledge se cae entero.
 */
export default async function TestSecurityPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-on-background">
          <Lock className="size-5 text-gold-leaf" aria-hidden />
          Laboratorio de cifrado cliente
        </h1>
        <p className="text-xs leading-snug text-subtle">
          POC del modo local-first: la clave se deriva del PIN en el navegador, el servidor guarda
          un texto que no puede abrir y el respaldo va cifrado al appDataFolder de Google Drive.
        </p>
      </div>

      <SecurityLab />
    </div>
  )
}
