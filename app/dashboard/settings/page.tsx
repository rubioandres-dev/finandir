import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BudgetProgress, type PresupuestoDeCategoria } from '@/components/budget-progress'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { createClient } from '@/lib/supabase/server'
import { formatoMoneda, rangoDelMesActual } from '@/lib/types'

export const metadata: Metadata = { title: 'Ajustes' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { categorias, delMes, cotizacion, faltaMigracion, bimoneda } =
    await cargarDatosDelDashboard(user.id)
  const { desde } = rangoDelMesActual()

  const gastadoPorCategoria = new Map<string, number>()
  for (const movimiento of delMes) {
    if (movimiento.type !== 'EXPENSE' || !movimiento.category_id) continue
    gastadoPorCategoria.set(
      movimiento.category_id,
      (gastadoPorCategoria.get(movimiento.category_id) ?? 0) + (bimoneda(movimiento).ars ?? 0)
    )
  }

  const presupuestos: PresupuestoDeCategoria[] = categorias
    .filter((c) => c.type === 'EXPENSE')
    .map((c) => ({
      id: c.id,
      nombre: c.name,
      icono: c.icon,
      color: c.color,
      presupuesto: c.monthly_budget === null ? null : Number(c.monthly_budget),
      gastado: gastadoPorCategoria.get(c.id) ?? 0,
    }))

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold tracking-tight">Ajustes</h1>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <CardLabel>Cuenta</CardLabel>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Email</dt>
              <dd className="truncate font-medium">{user.email}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Categorías</dt>
              <dd className="font-medium tabular-nums">{categorias.length}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Período actual</dt>
              <dd className="font-medium tabular-nums">{desde.slice(0, 7)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <CardLabel>Cotización</CardLabel>
          {cotizacion ? (
            <>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {formatoMoneda.format(cotizacion.venta)}
              </p>
              <p className="text-xs text-subtle">
                Dólar MEP · {cotizacion.fuente} ·{' '}
                {cotizacion.cacheada ? 'guardada' : 'en vivo, sin guardar'}
              </p>
              {!cotizacion.cacheada && (
                <p className="rounded-xl border border-budget-warn/30 bg-budget-warn/10 px-3 py-2 text-xs text-budget-warn">
                  No se está guardando el histórico de cotizaciones. Ejecutá{' '}
                  <code className="font-mono">migrations/002_multi_moneda.sql</code> para habilitar
                  la escritura en <code className="font-mono">exchange_rates</code>.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-subtle">No se pudo obtener la cotización.</p>
          )}
        </CardContent>
      </Card>

      <BudgetProgress categorias={presupuestos} faltaMigracion={faltaMigracion} />
    </div>
  )
}
