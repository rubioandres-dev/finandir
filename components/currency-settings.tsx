'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Coins, Loader2 } from 'lucide-react'
import { guardarDivisas } from '@/app/dashboard/settings/actions'
import { CurrencyPicker } from '@/components/currency-picker'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import type { Moneda } from '@/lib/types'

/**
 * Divisas de trabajo, con guardado al toque.
 *
 * Sin botón de guardar: cada chip escribe. El estado local se actualiza
 * OPTIMISTA y se revierte si el servidor rechaza — con un botón, el usuario
 * puede irse de la página creyendo que guardó.
 *
 * `router.refresh()` después de guardar no es opcional: cambiar las divisas
 * cambia lo que filtran todas las vistas y qué muestra el selector del header,
 * y eso lo decide el servidor.
 */
export function CurrencySettings({
  monedasIniciales,
  faltaMigracion,
}: {
  monedasIniciales: Moneda[]
  faltaMigracion: boolean
}) {
  const router = useRouter()
  const [monedas, setMonedas] = useState<Moneda[]>(monedasIniciales)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [guardando, iniciar] = useTransition()

  function cambiar(nuevas: Moneda[]) {
    const previas = monedas

    setMonedas(nuevas)
    setError(null)
    setGuardado(false)

    iniciar(async () => {
      const resultado = await guardarDivisas(nuevas)

      if (resultado.error) {
        setMonedas(previas)
        setError(resultado.error)
        return
      }

      setGuardado(true)
      router.refresh()
    })
  }

  return (
    <Card id="divisas" className="scroll-mt-24">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <CardLabel>
            <Coins className="size-3.5 text-gold-leaf" aria-hidden />
            Divisas de trabajo
          </CardLabel>

          {/* Confirmación discreta: es lo único que reemplaza al botón. */}
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
            Las divisas no se pueden guardar todavía: falta ejecutar{' '}
            <code className="font-mono">migrations/007_user_profiles_and_currencies.sql</code> en el
            SQL Editor de Supabase. Mientras tanto la app trabaja con ARS y USD.
          </p>
        ) : (
          <CurrencyPicker
            seleccionadas={monedas}
            onCambiar={cambiar}
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
          Sacar una divisa no borra nada: los movimientos, cuentas y deudas en esa moneda quedan
          guardados y vuelven a aparecer si la elegís de nuevo.
        </p>
      </CardContent>
    </Card>
  )
}
