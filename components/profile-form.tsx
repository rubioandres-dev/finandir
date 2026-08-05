'use client'

import { useActionState } from 'react'
import {
  actualizarPerfil,
  cambiarContrasena,
  type EstadoDePerfil,
} from '@/app/dashboard/settings/actions'
import { Card, CardContent, CardLabel } from '@/components/ui/card'

const CAMPO =
  'rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-4 py-3 text-base outline-none transition placeholder:text-subtle focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60'

const BOTON =
  'fire-gradient glow-gold self-start rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60'

/** Error y confirmación comparten el mismo lugar en las dos formas. */
function Aviso({ estado }: { estado: EstadoDePerfil }) {
  if (estado.error) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
      >
        {estado.error}
      </p>
    )
  }
  if (estado.mensaje) {
    return (
      <p
        role="status"
        className="rounded-lg border border-income/30 bg-income/10 px-3.5 py-2.5 text-sm text-income"
      >
        {estado.mensaje}
      </p>
    )
  }
  return null
}

export function ProfileForm({
  email,
  nombre,
}: {
  email: string
  nombre: string
}) {
  const [estadoPerfil, guardarPerfil, guardandoPerfil] = useActionState<EstadoDePerfil, FormData>(
    actualizarPerfil,
    {}
  )
  const [estadoClave, guardarClave, guardandoClave] = useActionState<EstadoDePerfil, FormData>(
    cambiarContrasena,
    {}
  )

  return (
    <Card id="perfil" className="scroll-mt-24">
      <CardContent className="flex flex-col gap-5">
        <CardLabel>Perfil</CardLabel>

        <form action={guardarPerfil} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nombre" className="text-sm font-medium">
              Nombre visible
            </label>
            <input
              id="nombre"
              name="nombre"
              type="text"
              maxLength={80}
              autoComplete="name"
              defaultValue={nombre}
              placeholder="Como querés que te llamemos"
              disabled={guardandoPerfil}
              className={CAMPO}
            />
            <p className="text-xs text-subtle">
              Se usa en el menú de perfil y en las iniciales del avatar.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email-perfil" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email-perfil"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={email}
              disabled={guardandoPerfil}
              className={CAMPO}
            />
            <p className="text-xs text-subtle">
              Cambiarlo pide confirmación en la casilla nueva antes de tener efecto.
            </p>
          </div>

          <Aviso estado={estadoPerfil} />

          <button type="submit" disabled={guardandoPerfil} className={BOTON}>
            {guardandoPerfil ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>

        <div className="h-px bg-glass-stroke/40" />

        <form action={guardarClave} className="flex flex-col gap-4">
          <CardLabel>Contraseña</CardLabel>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password-nueva" className="text-sm font-medium">
              Contraseña nueva
            </label>
            <input
              id="password-nueva"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="••••••••"
              disabled={guardandoClave}
              className={CAMPO}
            />
            <p className="text-xs text-subtle">Mínimo 6 caracteres.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password-repetida" className="text-sm font-medium">
              Repetila
            </label>
            <input
              id="password-repetida"
              name="repetida"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="••••••••"
              disabled={guardandoClave}
              className={CAMPO}
            />
          </div>

          <Aviso estado={estadoClave} />

          <button type="submit" disabled={guardandoClave} className={BOTON}>
            {guardandoClave ? 'Cambiando…' : 'Cambiar contraseña'}
          </button>
        </form>
      </CardContent>
    </Card>
  )
}
