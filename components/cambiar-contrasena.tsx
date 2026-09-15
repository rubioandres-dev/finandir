'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, KeyRound, Loader2, X } from 'lucide-react'
import { cambiarContrasena } from '@/lib/almacen/contrasena'
import { createClient } from '@/lib/supabase/client'
import type { Backend } from '@/lib/almacen/acceso'

/**
 * CAMBIAR LA CONTRASEÑA
 * =============================================================================
 *
 * PIDE LA ACTUAL, Y NO ES CEREMONIA
 *
 * Antes eran dos campos sueltos en Ajustes —nueva y repetida— y nada más.
 * Cualquiera que agarrara la sesión abierta podía cambiarla y dejar afuera al
 * dueño. Pedir la actual es lo que convierte "tener el teléfono en la mano" en
 * "saber la contraseña".
 *
 * Y EN MODO BÓVEDA HACE FALTA DE VERDAD
 *
 * Ahí son dos sistemas: con qué entrás (Supabase Auth) y con qué se descifran
 * tus datos (el sobre). La contraseña vieja es lo ÚNICO con lo que se puede
 * desenvolver la clave para volver a envolverla con la nueva.
 *
 * `lib/almacen/contrasena.ts` hace las dos cosas en el orden que deja el menor
 * daño posible si algo se corta, y estaba escrito y probado desde hace semanas
 * sin que nadie lo llamara. El formulario viejo cambiaba SOLO la de Auth: quien
 * estuviera en Bóveda entraba con la nueva y no podía leer nada.
 *
 * CORRE EN EL NAVEGADOR
 *
 * Por lo mismo de siempre: la contraseña deriva la clave, y esa clave es de lo
 * que el modo protege al servidor.
 */

const CAMPO =
  'rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-4 py-3 text-base outline-none transition placeholder:text-subtle focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60'

const BOTON =
  'fire-gradient glow-gold flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60'

const MINIMO = 8

export function CambiarContrasena({ email, backend }: { email: string; backend: Backend }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex cursor-pointer items-center gap-2 self-start rounded-lg border border-glass-stroke/50 px-4 py-2.5 text-sm text-on-background transition active:scale-95"
      >
        <KeyRound className="size-4 text-gold-leaf" aria-hidden />
        Cambiar contraseña
      </button>

      {abierto && (
        <Modal email={email} backend={backend} alCerrar={() => setAbierto(false)} />
      )}
    </>
  )
}

function Modal({
  email,
  backend,
  alCerrar,
}: {
  email: string
  backend: Backend
  alCerrar: () => void
}) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [estado, setEstado] = useState<
    { fase: 'formulario' } | { fase: 'trabajando' } | { fase: 'listo' }
  >({ fase: 'formulario' })
  const [error, setError] = useState<string | null>(null)

  const enVuelo = estado.fase === 'trabajando'

  async function enviar() {
    if (nueva.length < MINIMO) {
      setError(`La contraseña nueva tiene que tener al menos ${MINIMO} caracteres.`)
      return
    }
    if (nueva !== repetida) {
      setError('Las dos contraseñas nuevas no coinciden.')
      return
    }
    if (nueva === actual) {
      setError('La contraseña nueva tiene que ser distinta de la actual.')
      return
    }

    setError(null)
    setEstado({ fase: 'trabajando' })

    const supabase = createClient()

    // La actual se comprueba SIEMPRE contra Auth, en los dos modos. En Bóveda
    // `cambiarContrasena` la volvería a necesitar igual, pero fallar acá
    // devuelve un mensaje que se entiende en vez de un "secreto incorrecto"
    // que suena a que se rompió algo.
    const { error: errorLogin } = await supabase.auth.signInWithPassword({
      email,
      password: actual,
    })
    if (errorLogin) {
      setEstado({ fase: 'formulario' })
      setError('La contraseña actual no es correcta.')
      return
    }

    if (backend === 'SUPABASE') {
      const { error: errorCambio } = await supabase.auth.updateUser({ password: nueva })
      if (errorCambio) {
        setEstado({ fase: 'formulario' })
        setError(
          errorCambio.code === 'same_password'
            ? 'Esa ya es tu contraseña actual.'
            : `No se pudo cambiar la contraseña: ${errorCambio.message}`
        )
        return
      }
      setEstado({ fase: 'listo' })
      return
    }

    // --- Modo cifrado: Auth y el sobre, o ninguno de los dos -----------------
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setEstado({ fase: 'formulario' })
      setError('Tu sesión expiró. Volvé a iniciar sesión.')
      return
    }

    const r = await cambiarContrasena(supabase, user.id, actual, nueva)
    if (!r.ok) {
      setEstado({ fase: 'formulario' })
      setError(r.error)
      return
    }

    setEstado({ fase: 'listo' })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-midnight-navy/80 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Cambiar contraseña"
      onClick={(e) => {
        if (e.target === e.currentTarget && !enVuelo) alCerrar()
      }}
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-glass-stroke/50 bg-charcoal p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-base font-bold tracking-tight text-on-background">
            Cambiar contraseña
          </h2>
          <button
            type="button"
            onClick={alCerrar}
            disabled={enVuelo}
            aria-label="Cerrar"
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-on-surface-variant transition hover:text-on-background disabled:opacity-60"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {estado.fase === 'listo' ? (
          <div className="flex flex-col gap-3">
            <p className="flex items-start gap-2 rounded-lg border border-income/30 bg-income/10 px-3.5 py-2.5 text-sm text-income">
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Listo, tu contraseña quedó cambiada
                {backend !== 'SUPABASE' && ' — la de acceso y la de tus datos cifrados'}.
              </span>
            </p>
            <button type="button" onClick={alCerrar} className={BOTON}>
              Cerrar
            </button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!enVuelo) void enviar()
            }}
          >
            {backend !== 'SUPABASE' && (
              <p className="flex gap-2 rounded-lg border border-gold-leaf/30 bg-gold-leaf/5 p-3 text-[11px] leading-snug text-on-surface-variant">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-gold-leaf" aria-hidden />
                <span>
                  Estás en modo Bóveda: esto cambia la contraseña de acceso y la que descifra
                  tus datos, juntas. Tu código de recuperación no cambia y sigue sirviendo.
                </span>
              </p>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-on-surface-variant">Contraseña actual</span>
              <input
                type="password"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                autoComplete="current-password"
                autoFocus
                disabled={enVuelo}
                className={CAMPO}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-on-surface-variant">Contraseña nueva</span>
              <input
                type="password"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                autoComplete="new-password"
                disabled={enVuelo}
                className={CAMPO}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-on-surface-variant">Repetí la nueva</span>
              <input
                type="password"
                value={repetida}
                onChange={(e) => setRepetida(e.target.value)}
                autoComplete="new-password"
                disabled={enVuelo}
                className={CAMPO}
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={enVuelo || !actual || !nueva || !repetida}
              className={BOTON}
            >
              {enVuelo && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {enVuelo ? 'Cambiando…' : 'Cambiar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  )
}
