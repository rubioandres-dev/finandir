import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Construction, TrendingUp } from 'lucide-react'
import { Monto } from '@/components/monto'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { sumarMontos } from '@/lib/rates'
import { createClient } from '@/lib/supabase/server'
import { rangoDelPeriodo } from '@/lib/types'

export const metadata: Metadata = { title: 'FIRE' }

/** Tasa de retiro seguro de la regla del 4%, como en el tablero original. */
const TASA_RETIRO_SEGURO = 0.04

export default async function FirePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { delMes, ventana, bimoneda } = await cargarDatosDelDashboard(user.id)

  const gastoDelMes = sumarMontos(delMes.filter((t) => t.type === 'EXPENSE').map(bimoneda))

  // Promedio mensual del año en curso: una base menos ruidosa que un solo mes.
  const { desde: inicioAnio } = rangoDelPeriodo('anio')
  const gastosDelAnio = ventana.filter((t) => t.type === 'EXPENSE' && t.date >= inicioAnio)
  const mesesConDatos = new Set(gastosDelAnio.map((t) => t.date.slice(0, 7))).size || 1
  const totalAnio = sumarMontos(gastosDelAnio.map(bimoneda))

  const promedioMensual = {
    ars: totalAnio.ars === null ? null : Math.round(totalAnio.ars / mesesConDatos),
    usd: totalAnio.usd === null ? null : Math.round((totalAnio.usd / mesesConDatos) * 100) / 100,
  }

  // Capital objetivo = gasto anual / 4%.
  const capitalObjetivo = {
    ars:
      promedioMensual.ars === null
        ? null
        : Math.round((promedioMensual.ars * 12) / TASA_RETIRO_SEGURO),
    usd:
      promedioMensual.usd === null
        ? null
        : Math.round((promedioMensual.usd * 12) / TASA_RETIRO_SEGURO),
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <TrendingUp className="size-5 text-wealth" aria-hidden />
          Independencia financiera
        </h1>
        <p className="mt-1 text-sm text-muted">
          Cuánto capital necesitás para que tus gastos se cubran solos.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <CardLabel>Gasto del mes</CardLabel>
          <Monto
            {...gastoDelMes}
            className="mt-2 block text-xl font-semibold tracking-tight tabular-nums"
          />
        </Card>

        <Card className="p-4">
          <CardLabel>Promedio mensual</CardLabel>
          <Monto
            {...promedioMensual}
            className="mt-2 block text-xl font-semibold tracking-tight tabular-nums"
          />
          <p className="mt-1 text-[11px] text-subtle">
            {mesesConDatos} {mesesConDatos === 1 ? 'mes' : 'meses'} con datos
          </p>
        </Card>
      </div>

      <Card className="border-wealth/25 bg-wealth/[0.06] p-4">
        <CardLabel className="text-wealth">Capital objetivo · regla del 4%</CardLabel>
        <Monto
          {...capitalObjetivo}
          className="mt-2 block text-[2rem] font-semibold leading-none tracking-tight tabular-nums text-wealth"
        />
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
