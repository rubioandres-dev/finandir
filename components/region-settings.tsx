'use client'

import { Globe } from 'lucide-react'
import { RegionPicker } from '@/components/region-picker'
import { useAjustesEnBorrador } from '@/components/settings-draft'
import { useTraduccion } from '@/components/currency-provider'
import { Card, CardContent, CardLabel } from '@/components/ui/card'

/**
 * Región de formato.
 *
 * ANTES GUARDABA AL TOQUE Y PASABA POR UN MODAL
 *
 * El modal existía porque cambiar el formato altera la lectura de TODO el
 * histórico de un saque: "10/09" pasa a significar otro día. Ese riesgo sigue
 * siendo real, pero ahora la pausa la da la barra de confirmación: elegir la
 * región no escribe nada, y hay un paso explícito antes de que la app cambie.
 * Un modal encima de eso sería pedir la misma confirmación dos veces.
 */
export function RegionSettings() {
  const { t } = useTraduccion()
  const { valores, editar, guardando, faltaMigracion } = useAjustesEnBorrador()

  return (
    <Card id="region" className="scroll-mt-24">
      <CardContent className="flex flex-col gap-4">
        <CardLabel>
          <Globe className="size-3.5 text-gold-leaf" aria-hidden />
          {t('ajustes.region')}
        </CardLabel>

        {faltaMigracion ? (
          <p className="rounded-xl border border-budget-warn/30 bg-budget-warn/10 px-3 py-2 text-xs leading-snug text-budget-warn">
            La región no se puede guardar todavía: falta ejecutar{' '}
            <code className="font-mono">migrations/009_user_locale.sql</code> en el SQL Editor de
            Supabase. Mientras tanto la app usa el formato de Argentina.
          </p>
        ) : (
          <RegionPicker
            seleccionada={valores.locale}
            onCambiar={(locale) => editar('locale', locale)}
            deshabilitado={guardando}
          />
        )}

        <p className="text-[11px] leading-snug text-subtle">
          Cambia solo cómo se ESCRIBEN los importes y las fechas. No convierte nada ni toca tus
          divisas de trabajo: un gasto en pesos sigue siendo un gasto en pesos.{' '}
          {t('ajustes.avisoDiferido')}
        </p>
      </CardContent>
    </Card>
  )
}
