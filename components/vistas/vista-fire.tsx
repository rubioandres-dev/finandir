'use client'

import { TASA_RETIRO_SEGURO, type DatosDeFire, calcularFire } from './datos-fire'
import { Construction, TrendingUp } from 'lucide-react'
import { MontoPorMoneda } from '@/components/monto'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { GuardianDeBoveda } from '@/components/guardian-de-boveda'
import { useTraduccion } from '@/components/currency-provider'
import { CargadorEnCliente } from '@/components/vistas/cargador-en-cliente'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { createClient } from '@/lib/supabase/client'
import { type Moneda } from '@/lib/types'

export function VistaFire({ datos }: { datos: DatosDeFire }) {
  const { t } = useTraduccion()

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-on-background">
          <TrendingUp className="size-5 text-gold-leaf" aria-hidden />
          Independencia financiera
        </h1>
        <p className="mt-1 text-sm text-muted">
          Cuánto capital necesitás para que tus gastos se cubran solos. Cada moneda se calcula por
          separado.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <CardLabel>{t('fire.gastoDelMes')}</CardLabel>
          <div className="mt-2">
            <MontoPorMoneda
              totales={datos.gastoDelMes}
              className="text-lg font-semibold tracking-tight tabular-nums"
            />
          </div>
        </Card>

        <Card className="p-4">
          <CardLabel>{t('fire.promedioMensual')}</CardLabel>
          <div className="mt-2">
            <MontoPorMoneda
              totales={datos.promedioMensual}
              className="text-lg font-semibold tracking-tight tabular-nums"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">
            {datos.mesesConDatos} {datos.mesesConDatos === 1 ? 'mes' : 'meses'} con datos
          </p>
        </Card>
      </div>

      <Card glass className="glow-gold p-4">
        <CardLabel className="text-gold-leaf">{t('fire.capitalObjetivo')}</CardLabel>
        <div className="mt-2">
          <MontoPorMoneda
            totales={datos.capitalObjetivo}
            className="font-display text-2xl font-bold leading-tight tracking-tighter tabular-nums text-gold-leaf"
          />
        </div>
        <p className="mt-2.5 text-xs text-muted">
          Gasto anual dividido {TASA_RETIRO_SEGURO}. Es el capital desde el cual podrías retirar ese
          porcentaje por año sin consumirlo.
        </p>
      </Card>

      <Card>
        <CardContent className="flex gap-3">
          <Construction className="mt-0.5 size-4 shrink-0 text-budget-warn" aria-hidden />
          <div className="flex flex-col gap-1.5 text-sm">
            <p className="font-medium tracking-tight">Falta el panel de patrimonio</p>
            <p className="text-muted">
              La proyección a 40 años, el año de independencia estimado y el buffer de emergencia
              necesitan las tablas de activos (<code className="font-mono text-xs">assets</code>,{' '}
              <code className="font-mono text-xs">asset_types</code>,{' '}
              <code className="font-mono text-xs">fire_settings</code>), que todavía no existen.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function FireEnCliente({ monedas }: { monedas: Moneda[] }) {
  return (
    <GuardianDeBoveda>
      <CargadorEnCliente
        cargar={async (libro) => {
            // Las cotizaciones siguen en Supabase: son caché global, no un dato
            // del usuario.
            const { delMes, ventana } = await cargarDatosDelDashboard(
              libro,
              createClient(),
              undefined,
              monedas
            )
            return calcularFire(delMes, ventana, monedas)
          }}
        ver={(datos) => <VistaFire datos={datos} />}
      />
    </GuardianDeBoveda>
  )
}
