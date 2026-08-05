'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { unirseAEspacio } from '@/app/dashboard/shared-expenses/actions'
import { useTraduccion } from '@/components/currency-provider'

/** Confirmación antes de entrar a un grupo escaneado. */
export function JoinSpace({ spaceId, yaEsMiembro }: { spaceId: string; yaEsMiembro: boolean }) {
  const router = useRouter()
  const { t } = useTraduccion()
  const [error, setError] = useState<string | null>(null)
  const [enVuelo, iniciar] = useTransition()

  if (yaEsMiembro) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-on-surface-variant">{t('compartidos.yaSosMiembro')}</p>
        <button
          type="button"
          onClick={() => router.push(`/dashboard/shared-expenses/${spaceId}`)}
          className="fire-gradient glow-gold cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95"
        >
          {t('nav.compartidos')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() =>
          iniciar(async () => {
            const resultado = await unirseAEspacio(spaceId)
            if (!resultado.ok) {
              setError(resultado.error)
              return
            }
            router.push(`/dashboard/shared-expenses/${spaceId}`)
          })
        }
        disabled={enVuelo}
        className="fire-gradient glow-gold flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60"
      >
        {enVuelo ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <UserPlus className="size-4" aria-hidden />
        )}
        {t('compartidos.unirse')}
      </button>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
        >
          {error}
        </p>
      )}
    </div>
  )
}
