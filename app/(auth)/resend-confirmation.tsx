'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2, MailCheck } from 'lucide-react'
import { reenviarConfirmacion } from './actions'

const ESPERA_INICIAL = 30

export function ResendConfirmation({ email }: { email: string }) {
  const [restante, setRestante] = useState(ESPERA_INICIAL)
  const [enviando, iniciarEnvio] = useTransition()
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  // Cuenta regresiva de un segundo; se detiene sola al llegar a cero.
  useEffect(() => {
    if (restante <= 0) return
    const id = setTimeout(() => setRestante((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [restante])

  function reenviar() {
    if (restante > 0 || enviando) return

    iniciarEnvio(async () => {
      const resultado = await reenviarConfirmacion(email)
      setAviso({ ok: resultado.ok, texto: resultado.mensaje })
      // Si Supabase pide más tiempo del previsto, respetamos su ventana.
      setRestante(resultado.esperarSegundos ?? ESPERA_INICIAL)
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3.5 py-3 dark:border-white/12 dark:bg-white/[0.03]">
      <p className="flex items-start gap-2 text-xs text-black/60 dark:text-white/60">
        <MailCheck className="mt-px size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <span>
          Enviado a <strong className="font-medium">{email}</strong>. Revisá también el correo no
          deseado.
        </span>
      </p>

      {aviso && (
        <p
          role="status"
          className={`text-xs ${
            aviso.ok
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-amber-700 dark:text-amber-400'
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <button
        type="button"
        onClick={reenviar}
        disabled={restante > 0 || enviando}
        aria-live="polite"
        className="flex items-center justify-center gap-1.5 self-start rounded-md px-0 py-0.5 text-xs font-medium text-emerald-600 transition hover:underline disabled:cursor-not-allowed disabled:text-black/35 disabled:no-underline dark:text-emerald-400 dark:disabled:text-white/35"
      >
        {enviando && <Loader2 className="size-3 animate-spin" aria-hidden />}
        {enviando
          ? 'Reenviando…'
          : restante > 0
            ? `¿No te llegó? Reenviar en ${restante}s`
            : 'Reenviar email de confirmación'}
      </button>
    </div>
  )
}
