'use client'

import { useState } from 'react'
import { KeyRound, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { useEstadoDelLibro } from '@/components/libro-provider'
import { useTraduccion } from '@/components/currency-provider'

// Los mismos que usa `profile-form`: un formulario nuevo no puede verse
// distinto del resto por haber nacido despues.
const CAMPO =
  'rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-4 py-3 text-base outline-none transition placeholder:text-subtle focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60'

const BOTON =
  'fire-gradient glow-gold flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60'

/**
 * EL GUARDIÁN
 * =============================================================================
 *
 * Envuelve cualquier cosa que necesite el libro del navegador. Mientras la
 * bóveda esté cerrada muestra el desbloqueo; cuando se abre, deja pasar a sus
 * hijos.
 *
 * POR QUÉ ES UN COMPONENTE Y NO UN REDIRECT
 *
 * Un redirect a "/desbloquear" perdería la página a la que el usuario quería
 * ir, y volver ahí después del desbloqueo pide guardar y restaurar la ruta.
 * Como guardián, la página que está debajo ni se entera: se monta cuando hay
 * libro y ya.
 *
 * LA SEGUNDA OPCIÓN NO SE OFRECE DE ENTRADA
 *
 * El código de recuperación aparece detrás de un "no me acuerdo". Ofrecer las
 * dos puertas juntas invita a usar la de emergencia como si fuera normal, y esa
 * es la que hay que anotar en papel y guardar lejos.
 */
export function GuardianDeBoveda({ children }: { children: React.ReactNode }) {
  const estado = useEstadoDelLibro()

  if (estado.fase === 'abierto') return <>{children}</>

  if (estado.fase === 'cargando') {
    // Sin este estado, la pantalla de desbloqueo parpadearia en cada recarga
    // para quien ya tiene la clave guardada en este dispositivo.
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status">
        <Loader2 className="size-6 animate-spin text-gold-leaf" aria-hidden />
      </div>
    )
  }

  return <Desbloqueo />
}

function Desbloqueo() {
  const { desbloquear } = useEstadoDelLibro()
  const { t } = useTraduccion()

  const [secreto, setSecreto] = useState('')
  const [conCodigo, setConCodigo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abriendo, setAbriendo] = useState(false)

  async function alEnviar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!secreto.trim() || abriendo) return

    setAbriendo(true)
    setError(null)

    const falla = await desbloquear(secreto, conCodigo ? 'recuperacion' : 'contrasena')

    // Se limpia SIEMPRE, salga bien o mal: el secreto no tiene por qué quedar
    // vivo en el estado de React despues del intento.
    setSecreto('')
    setAbriendo(false)
    if (falla) setError(falla)
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col justify-center gap-5 px-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="rounded-full bg-gold-leaf/10 p-3">
          <Lock className="size-6 text-gold-leaf" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold">
          {t('boveda.titulo')}
        </h1>
        <p className="text-balance text-xs leading-snug text-on-surface-variant">
          {t('boveda.explicacion')}
        </p>
      </div>

      <form onSubmit={alEnviar} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-on-surface-variant">
            {conCodigo ? t('boveda.etiquetaCodigo') : t('boveda.etiquetaContrasena')}
          </span>
          <input
            type={conCodigo ? 'text' : 'password'}
            value={secreto}
            onChange={(e) => setSecreto(e.target.value)}
            autoFocus
            autoComplete={conCodigo ? 'off' : 'current-password'}
            spellCheck={false}
            placeholder={conCodigo ? 'XXXXX-XXXXX-XXXXX-XXXXX' : ''}
            className={CAMPO}
          />
        </label>

        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={abriendo || !secreto.trim()}
          className={BOTON}
        >
          {abriendo ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t('boveda.abriendo')}
            </>
          ) : (
            <>
              <ShieldCheck className="size-4" aria-hidden />
              {t('boveda.abrir')}
            </>
          )}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setConCodigo((v) => !v)
          setSecreto('')
          setError(null)
        }}
        className="flex cursor-pointer items-center justify-center gap-1.5 text-[11px] text-subtle underline underline-offset-2 transition hover:text-on-surface-variant"
      >
        <KeyRound className="size-3" aria-hidden />
        {conCodigo ? t('boveda.volverAContrasena') : t('boveda.noMeAcuerdo')}
      </button>

      {/* Se dice donde importa: descifrar cuesta, y el usuario tiene que saber
          por que la app tarda un segundo en abrir. */}
      <p className="text-center text-[10px] leading-snug text-subtle">
        {t('boveda.avisoDerivacion')}
      </p>
    </div>
  )
}
