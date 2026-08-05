'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Globe, Loader2 } from 'lucide-react'
import { guardarLocale } from '@/app/dashboard/settings/actions'
import { LocationConfirmModal } from '@/components/location-confirm-modal'
import { RegionPicker } from '@/components/region-picker'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { nombreDeRegion, type Locale } from '@/lib/formatters'

/**
 * Región de formato, con guardado al toque.
 *
 * Mismo criterio que las divisas: el estado local se actualiza optimista y se
 * revierte si el servidor rechaza. Con un botón de guardar, el usuario puede
 * irse de la página creyendo que guardó.
 */
export function RegionSettings({
  localeInicial,
  faltaMigracion,
}: {
  localeInicial: Locale
  faltaMigracion: boolean
}) {
  const router = useRouter()
  const [locale, setLocale] = useState<Locale>(localeInicial)
  const [pendiente, setPendiente] = useState<Locale | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [guardando, iniciar] = useTransition()

  // Pasa por confirmación igual que el idioma: cambiar el formato de las
  // fechas altera la lectura de TODO el histórico de un saque, y "10/09"
  // pasando a significar otro día merece un segundo de pausa.
  function confirmar() {
    if (!pendiente) return
    const elegida = pendiente

    setError(null)
    setGuardado(false)

    iniciar(async () => {
      const resultado = await guardarLocale(elegida)

      if (resultado.error) {
        setError(resultado.error)
        setPendiente(null)
        return
      }

      setLocale(elegida)
      setPendiente(null)
      setGuardado(true)
      // El formato lo baja el provider desde el layout: sin esto, la app
      // sigue mostrando el formato viejo hasta la próxima navegación.
      router.refresh()
    })
  }

  return (
    <>
    <Card id="region" className="scroll-mt-24">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <CardLabel>
            <Globe className="size-3.5 text-gold-leaf" aria-hidden />
            Región y formato
          </CardLabel>

          <span aria-live="polite" className="text-[11px] text-subtle">
            {guardando ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Guardando…
              </span>
            ) : guardado ? (
              <span className="flex items-center gap-1.5 text-income">
                <Check className="size-3" aria-hidden />
                Guardado
              </span>
            ) : null}
          </span>
        </div>

        {faltaMigracion ? (
          <p className="rounded-xl border border-budget-warn/30 bg-budget-warn/10 px-3 py-2 text-xs leading-snug text-budget-warn">
            La región no se puede guardar todavía: falta ejecutar{' '}
            <code className="font-mono">migrations/009_user_locale.sql</code> en el SQL Editor de
            Supabase. Mientras tanto la app usa el formato de Argentina.
          </p>
        ) : (
          <RegionPicker
            seleccionada={locale}
            onCambiar={setPendiente}
            deshabilitado={guardando}
          />
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
          >
            {error}
          </p>
        )}

        <p className="text-[11px] leading-snug text-subtle">
          Cambia solo cómo se ESCRIBEN los importes y las fechas. No convierte nada ni toca tus
          divisas de trabajo: un gasto en pesos sigue siendo un gasto en pesos.
        </p>
      </CardContent>
    </Card>

    {pendiente && (
      <LocationConfirmModal
        destino={nombreDeRegion(pendiente)}
        guardando={guardando}
        onConfirmar={confirmar}
        onCancelar={() => setPendiente(null)}
      />
    )}
    </>
  )
}
