'use client'

import { Check, Languages } from 'lucide-react'
import { useAjustesEnBorrador } from '@/components/settings-draft'
import { useTraduccion } from '@/components/currency-provider'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { CATALOGO_IDIOMAS } from '@/lib/i18n'

/**
 * Idioma de la interfaz.
 *
 * POR QUÉ YA NO HAY MODAL DE CONFIRMACIÓN
 *
 * Lo había porque cambiar el idioma reescribe el botón que hace falta para
 * volver atrás: un toque accidental dejaba la app en una lengua que el usuario
 * no lee, y sin saber dónde tocar para deshacerlo. La barra de cambios sin
 * guardar cubre exactamente ese riesgo y mejor: elegir un idioma no cambia
 * nada todavía, y "Descartar" está a un toque mientras la app sigue en el
 * idioma que se entiende.
 */
export function LanguageSettings() {
  const { t } = useTraduccion()
  const { valores, editar, guardando, faltaMigracion } = useAjustesEnBorrador()

  return (
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
              // El elegido es el del BORRADOR: el usuario tiene que ver su
              // elección marcada aunque todavía no la haya confirmado.
              const activo = codigo === valores.idioma

              return (
                <li key={codigo}>
                  <button
                    type="button"
                    onClick={() => editar('idioma', codigo)}
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

        <p className="text-[11px] leading-snug text-subtle">
          {t('ajustes.idiomaAyuda')} {t('ajustes.avisoDiferido')}
        </p>
      </CardContent>
    </Card>
  )
}
