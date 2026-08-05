'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Languages } from 'lucide-react'
import { guardarIdioma } from '@/app/dashboard/settings/actions'
import { useTraduccion } from '@/components/currency-provider'
import { LocationConfirmModal } from '@/components/location-confirm-modal'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { CATALOGO_IDIOMAS, nombreDeIdioma, type Idioma } from '@/lib/i18n'

/**
 * Idioma de la interfaz.
 *
 * A diferencia de divisas y región, este NO guarda al toque: pasa por
 * `LocationConfirmModal`. El motivo está explicado ahí — cambiar el idioma
 * reescribe el botón que hace falta para volver atrás.
 */
export function LanguageSettings({
  idiomaInicial,
  faltaMigracion,
}: {
  idiomaInicial: Idioma
  faltaMigracion: boolean
}) {
  const router = useRouter()
  const { t } = useTraduccion()

  const [idioma, setIdioma] = useState<Idioma>(idiomaInicial)
  const [pendiente, setPendiente] = useState<Idioma | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()

  function confirmar() {
    if (!pendiente) return
    const elegido = pendiente

    iniciar(async () => {
      const resultado = await guardarIdioma(elegido)

      if (resultado.error) {
        setError(resultado.error)
        setPendiente(null)
        return
      }

      setIdioma(elegido)
      setPendiente(null)
      setError(null)
      // El idioma lo baja el provider desde el layout.
      router.refresh()
    })
  }

  return (
    <>
      <Card id="idioma" className="scroll-mt-24">
        <CardContent className="flex flex-col gap-4">
          <CardLabel>
            <Languages className="size-3.5 text-gold-leaf" aria-hidden />
            {t('ajustes.idioma')}
          </CardLabel>

          {faltaMigracion ? (
            <p className="rounded-xl border border-budget-warn/30 bg-budget-warn/10 px-3 py-2 text-xs leading-snug text-budget-warn">
              El idioma no se puede guardar todavía: falta ejecutar{' '}
              <code className="font-mono">migrations/010_goals_and_aurem_tier.sql</code> en el SQL
              Editor de Supabase.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {CATALOGO_IDIOMAS.map(({ codigo, nombre, bandera, detalle }) => {
                const activo = codigo === idioma

                return (
                  <li key={codigo}>
                    <button
                      type="button"
                      onClick={() => setPendiente(codigo)}
                      disabled={guardando || activo}
                      aria-pressed={activo}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.98] disabled:cursor-default ${
                        activo
                          ? 'border-gold-leaf bg-gold-leaf/10'
                          : 'cursor-pointer border-glass-stroke/50 hover:border-gold-leaf/60'
                      }`}
                    >
                      <span className="text-lg leading-none" aria-hidden>
                        {bandera}
                      </span>

                      <span className="flex min-w-0 flex-1 flex-col">
                        <span
                          className={`text-sm font-medium ${activo ? 'text-gold-leaf' : 'text-on-background'}`}
                        >
                          {nombre}
                        </span>
                        <span className="truncate text-[11px] text-subtle">{detalle}</span>
                      </span>

                      {activo && <Check className="size-4 shrink-0 text-gold-leaf" aria-hidden />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
            >
              {error}
            </p>
          )}

          <p className="text-[11px] leading-snug text-subtle">{t('ajustes.idiomaAyuda')}</p>
        </CardContent>
      </Card>

      {pendiente && (
        <LocationConfirmModal
          destino={nombreDeIdioma(pendiente)}
          guardando={guardando}
          onConfirmar={confirmar}
          onCancelar={() => setPendiente(null)}
        />
      )}
    </>
  )
}
