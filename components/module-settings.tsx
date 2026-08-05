'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Loader2, Lock, LayoutGrid } from 'lucide-react'
import { guardarModulos } from '@/app/dashboard/settings/actions'
import { useTraduccion } from '@/components/currency-provider'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import {
  esModuloFijo,
  MODULOS,
  moduloActivo,
  type EstadoDeModulos,
  type Modulo,
} from '@/lib/modules'
import type { Clave } from '@/lib/i18n'

/** Cada módulo con su etiqueta y su explicación, tomadas del diccionario. */
const ETIQUETAS: Record<Modulo, { nombre: Clave; detalle: Clave }> = {
  accounts: { nombre: 'nav.cuentas', detalle: 'modulos.cuentasDetalle' },
  transactions: { nombre: 'nav.movimientos', detalle: 'modulos.movimientosDetalle' },
  investments: { nombre: 'nav.inversiones', detalle: 'modulos.inversionesDetalle' },
  smart_spend: { nombre: 'nav.gastoInteligente', detalle: 'nav.gastoInteligenteDetalle' },
  commitments: { nombre: 'modulos.cuotas', detalle: 'modulos.cuotasDetalle' },
  calendar: { nombre: 'nav.calendario', detalle: 'nav.calendarioDetalle' },
  debts: { nombre: 'nav.deudas', detalle: 'nav.deudasDetalle' },
  goals: { nombre: 'nav.objetivos', detalle: 'nav.objetivosDetalle' },
  shared_expenses: { nombre: 'nav.compartidos', detalle: 'nav.compartidosDetalle' },
  fire: { nombre: 'nav.fire', detalle: 'nav.fireDetalle' },
}

/**
 * Qué secciones de la app quiere ver este usuario.
 *
 * APAGAR NO BORRA NADA. Un módulo apagado desaparece de la barra inferior, de
 * la bandeja "Más" y del dashboard, pero sus datos siguen ahí y su ruta sigue
 * respondiendo. Es una decisión de interfaz, no de retención: alguien que
 * apaga Inversiones porque no invierte no debería perder lo que cargó si mañana
 * lo vuelve a prender.
 */
export function ModuleSettings({
  inicial,
  faltaMigracion,
}: {
  inicial: EstadoDeModulos
  faltaMigracion: boolean
}) {
  const router = useRouter()
  const { t } = useTraduccion()

  const [estado, setEstado] = useState<EstadoDeModulos>(inicial)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [guardando, iniciar] = useTransition()

  function alternar(modulo: Modulo) {
    if (esModuloFijo(modulo)) return

    const previo = estado
    const siguiente = { ...estado, [modulo]: !moduloActivo(estado, modulo) }

    setEstado(siguiente)
    setError(null)
    setGuardado(false)

    iniciar(async () => {
      const resultado = await guardarModulos(siguiente)

      if (resultado.error) {
        setEstado(previo)
        setError(resultado.error)
        return
      }

      setGuardado(true)
      // La navegación se arma en el layout: sin refrescar, la barra inferior
      // sigue mostrando lo que se acaba de apagar.
      router.refresh()
    })
  }

  return (
    <Card id="modulos" className="scroll-mt-24">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <CardLabel>
            <LayoutGrid className="size-3.5 text-gold-leaf" aria-hidden />
            {t('modulos.titulo')}
          </CardLabel>

          <span aria-live="polite" className="text-[11px] text-subtle">
            {guardando ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                {t('ajustes.guardando')}
              </span>
            ) : guardado ? (
              <span className="flex items-center gap-1.5 text-income">
                <Check className="size-3" aria-hidden />
                {t('ajustes.guardado')}
              </span>
            ) : null}
          </span>
        </div>

        {faltaMigracion && (
          <p className="rounded-xl border border-budget-warn/30 bg-budget-warn/10 px-3 py-2 text-xs leading-snug text-budget-warn">
            {t('modulos.faltaMigracion')}
          </p>
        )}

        <ul className="flex flex-col divide-y divide-glass-stroke/25">
          {MODULOS.map((modulo) => {
            const fijo = esModuloFijo(modulo)
            const activo = moduloActivo(estado, modulo)
            const { nombre, detalle } = ETIQUETAS[modulo]

            return (
              <li key={modulo} className="flex items-center gap-3 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-on-background">
                    {t(nombre)}
                    {fijo && <Lock className="size-3 shrink-0 text-subtle" aria-hidden />}
                  </span>
                  <span className="text-[11px] leading-snug text-subtle">
                    {fijo ? t('modulos.fijo') : t(detalle)}
                  </span>
                </div>

                {/* Switch nativo por accesibilidad: `role="switch"` sobre un
                    botón es lo que anuncia el estado sin JS extra. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={activo}
                  aria-label={t(nombre)}
                  onClick={() => alternar(modulo)}
                  disabled={fijo || guardando || faltaMigracion}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
                    activo ? 'bg-gold-leaf' : 'bg-foreground/15'
                  } ${fijo || faltaMigracion ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span
                    className={`absolute top-0.5 size-5 rounded-full bg-menu shadow transition-all ${
                      activo ? 'left-[1.375rem]' : 'left-0.5'
                    }`}
                    aria-hidden
                  />
                </button>
              </li>
            )
          })}
        </ul>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
          >
            {error}
          </p>
        )}

        <p className="text-[11px] leading-snug text-subtle">{t('modulos.ayuda')}</p>
      </CardContent>
    </Card>
  )
}
