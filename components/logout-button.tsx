'use client'

import { useFormStatus } from 'react-dom'
import { cerrarSesion } from '@/app/(auth)/actions'

function Boton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="hidden rounded-xl border border-glass-stroke/50 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition active:scale-90 hover:border-gold-leaf/60 hover:text-gold-leaf disabled:opacity-50 sm:block"
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
