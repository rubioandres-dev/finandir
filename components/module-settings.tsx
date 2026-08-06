'use client'

import { Lock, LayoutGrid } from 'lucide-react'
import { useAjustesEnBorrador } from '@/components/settings-draft'
import { useTraduccion } from '@/components/currency-provider'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { esModuloFijo, MODULOS, moduloActivo, type Modulo } from '@/lib/modules'
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
 *
 * NO GUARDA: escribe en el borrador de `<SettingsDraftProvider>` y la barra
 * inferior confirma. Antes cada switch era su propia Server Action, y apagar
 * tres módulos reconstruía el layout tres veces.
 */
export function ModuleSettings() {
  const { t } = useTraduccion()
  const { valores, editar, guardando, faltaMigracion } = useAjustesEnBorrador()

  function alternar(modulo: Modulo) {
    if (esModuloFijo(modulo)) return

    editar('modulos', {
      ...valores.modulos,
      [modulo]: !moduloActivo(valores.modulos, modulo),
    })
  }

  return (
    <Card id="modulos" className="scroll-mt-24">
      <CardContent className="flex flex-col gap-4">
        <CardLabel>
          <LayoutGrid className="size-3.5 text-gold-leaf" aria-hidden />
          {t('modulos.titulo')}
        </CardLabel>

        {faltaMigracion && (
          <p className="rounded-xl border border-budget-warn/30 bg-budget-warn/10 px-3 py-2 text-xs leading-snug text-budget-warn">
            {t('modulos.faltaMigracion')}
          </p>
        )}

        <ul className="flex flex-col divide-y divide-glass-stroke/25">
          {MODULOS.map((modulo) => {
            const fijo = esModuloFijo(modulo)
            const activo = moduloActivo(valores.modulos, modulo)
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

        <p className="text-[11px] leading-snug text-subtle">
          {t('modulos.ayuda')} {t('ajustes.avisoDiferido')}
        </p>
      </CardContent>
    </Card>
  )
}
