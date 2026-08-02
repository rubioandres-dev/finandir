'use client'

import { useFormStatus } from 'react-dom'
import { cerrarSesion } from '@/app/(auth)/actions'

function Boton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-foreground/65 transition hover:border-black/25 hover:text-black disabled:opacity-50 dark:border-white/15 dark:text-white/65 dark:hover:border-white/30 dark:hover:text-white"
    >
      {pending ? 'Saliendo…' : 'Salir'}
    </button>
  )
}

export function LogoutButton() {
  return (
    <form action={cerrarSesion}>
      <Boton />
    </form>
  )
}
