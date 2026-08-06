import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BudgetProgress, type PresupuestoDeCategoria } from '@/components/budget-progress'
import { CurrencySettings } from '@/components/currency-settings'
import { LanguageSettings } from '@/components/language-settings'
import { ModuleSettings } from '@/components/module-settings'
import { ProfileForm } from '@/components/profile-form'
import { RegionSettings } from '@/components/region-settings'
import { SettingsDraftProvider } from '@/components/settings-draft'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { crearTraductor } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { formatoMoneda, rangoDelMesActual } from '@/lib/types'

export const metadata: Metadata = { title: 'Ajustes' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Ajustes muestra TODAS las divisas del perfil, no solo la activa: es donde
  // se administran, así que filtrarlas por el modo del header sería absurdo.
  const {
    monedas,
    locale,
    idioma,
    modulos,
    perfil,
    faltaMigracion: faltaPerfil,
  } = await cargarContextoDeMonedas()
  const tr = crearTraductor(idioma)

  const { categorias, delMes, presupuestos, cotizacion, faltaMigracion } =
    await cargarDatosDelDashboard(undefined, monedas)
  const { desde } = rangoDelMesActual()

  const gastado = new Map<string, number>()
  for (const movimiento of delMes) {
    if (movimiento.type !== 'EXPENSE' || !movimiento.category_id) continue
    const clave = `${movimiento.category_id}:${movimiento.currency}`
    gastado.set(clave, (gastado.get(clave) ?? 0) + Number(movimiento.amount))
  }

  const limitePorClave = new Map(
    presupuestos.map((p) => [`${p.category_id}:${p.currency}`, Number(p.amount)])
  )

  const presupuestosPorCategoria: PresupuestoDeCategoria[] = categorias
    .filter((c) => c.type === 'EXPENSE')
    .map((c) => ({
      id: c.id,
      nombre: c.name,
      icono: c.icon,
      color: c.color,
      lineas: monedas.map((moneda) => ({
        moneda,
        presupuesto: limitePorClave.get(`${c.id}:${moneda}`) ?? null,
        gastado: gastado.get(`${c.id}:${moneda}`) ?? 0,
      })),
    }))

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-lg font-bold tracking-tight text-on-background">{tr('ajustes.titulo')}</h1>

      <ProfileForm
        email={user.email ?? ''}
        nombre={
          perfil?.display_name ??
          (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '')
        }
      />

      {/* Las divisas siguen guardando al toque: cambiarlas altera la lista del
          selector del header, y dejarlas en un borrador sin confirmar mostraría
          un header ofreciendo divisas que el servidor no conoce. */}
      <CurrencySettings monedasIniciales={monedas} faltaMigracion={faltaPerfil} />

      {/* Región, idioma y módulos comparten un solo borrador y una sola
          escritura: los tres reconstruyen el layout entero, y hacerlo una vez
          por toque era el origen del parpadeo. */}
      <SettingsDraftProvider
        inicial={{ locale, idioma, modulos }}
        faltaMigracion={faltaPerfil}
      >
        <RegionSettings />
        <LanguageSettings />
        <ModuleSettings />
      </SettingsDraftProvider>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <CardLabel>{tr('ajustes.cuenta')}</CardLabel>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">{tr('ajustes.categoriasContador')}</dt>
              <dd className="font-medium tabular-nums">{categorias.length}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">{tr('ajustes.periodoActual')}</dt>
              <dd className="font-medium tabular-nums">{desde.slice(0, 7)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <CardLabel>{tr('ajustes.cotizacion')}</CardLabel>
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
            <p className="text-sm text-subtle">{tr('ajustes.sinCotizacion')}</p>
          )}
        </CardContent>
      </Card>

      <BudgetProgress categorias={presupuestosPorCategoria} faltaMigracion={faltaMigracion} />
    </div>
  )
}
