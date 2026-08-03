'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { EstadoAuth } from './actions'
import { ResendConfirmation } from './resend-confirmation'

type Props = {
  modo: 'login' | 'signup'
  accion: (estado: EstadoAuth, formData: FormData) => Promise<EstadoAuth>
  redirectTo?: string
  /** Error que llega por querystring, ej. desde /auth/callback. */
  errorInicial?: string
}

const TEXTOS = {
  login: {
    titulo: 'Iniciar sesión',
    subtitulo: 'Entrá para ver tus finanzas.',
    boton: 'Entrar',
    botonCargando: 'Entrando…',
    pie: '¿No tenés cuenta?',
    enlace: '/signup',
    textoEnlace: 'Creá una',
    autocomplete: 'current-password',
  },
  signup: {
    titulo: 'Crear cuenta',
    subtitulo: 'Empezá a registrar tus gastos en segundos.',
    boton: 'Crear cuenta',
    botonCargando: 'Creando…',
    pie: '¿Ya tenés cuenta?',
    enlace: '/login',
    textoEnlace: 'Iniciá sesión',
    autocomplete: 'new-password',
  },
} as const

export function AuthForm({ modo, accion, redirectTo, errorInicial }: Props) {
  const [estado, ejecutar, pendiente] = useActionState<EstadoAuth, FormData>(accion, {
    error: errorInicial,
  })
  const [verPassword, setVerPassword] = useState(false)
  const t = TEXTOS[modo]

  // Al enviar, la contraseña vuelve a ocultarse: que no quede a la vista en
  // pantalla después de un intento fallido.
  function enviar(formData: FormData) {
    setVerPassword(false)
    return ejecutar(formData)
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t.titulo}</h1>
        <p className="text-sm text-muted">{t.subtitulo}</p>
      </div>

      <form action={enviar} className="flex flex-col gap-4">
        {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="vos@ejemplo.com"
            disabled={pendiente}
            className="rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-4 py-3 text-base outline-none transition placeholder:text-subtle focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={verPassword ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete={t.autocomplete}
              placeholder="••••••••"
              disabled={pendiente}
              className="w-full rounded-lg border border-glass-stroke/50 bg-charcoal/60 py-3 pl-4 pr-12 text-base outline-none transition placeholder:text-subtle focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setVerPassword((v) => !v)}
              disabled={pendiente}
              // El input mantiene el foco: sin esto, hacer clic en el ojito
              // saca el cursor de donde el usuario venía escribiendo.
              onMouseDown={(e) => e.preventDefault()}
              aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={verPassword}
              aria-controls="password"
              className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-md text-on-surface-variant/60 transition hover:text-gold-leaf focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-leaf disabled:opacity-40"
            >
              {verPassword ? (
                <EyeOff className="size-[18px]" aria-hidden />
              ) : (
                <Eye className="size-[18px]" aria-hidden />
              )}
            </button>
          </div>
          {modo === 'signup' && (
            <p className="text-xs text-subtle">Mínimo 6 caracteres.</p>
          )}
        </div>

        {estado.error && (
          <p
            role="alert"
            className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
          >
            {estado.error}
          </p>
        )}

        {estado.mensaje && (
          <p
            role="status"
            className="rounded-lg border border-income/30 bg-income/10 px-3.5 py-2.5 text-sm text-income"
          >
            {estado.mensaje}
          </p>
        )}

        {estado.emailPendiente && <ResendConfirmation email={estado.emailPendiente} />}

        <button
          type="submit"
          disabled={pendiente}
          className="btn-gold mt-1 rounded-lg px-4 py-3 font-display text-sm font-bold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendiente ? t.botonCargando : t.boton}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {t.pie}{' '}
        <Link href={t.enlace} className="font-medium text-primary hover:underline">
          {t.textoEnlace}
        </Link>
      </p>
    </div>
  )
}
