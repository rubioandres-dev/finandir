import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Award, Target } from 'lucide-react'
import { GoalsManager } from '@/components/goals-manager'
import { Card, CardLabel } from '@/components/ui/card'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import {
  avanceDentroDelTier,
  calcularAvance,
  cargarObjetivos,
  medirObjetivo,
  siguienteTier,
  tierPara,
  TIERS,
  type BaseDeMedicion,
} from '@/lib/goals-service'
import { crearTraductor } from '@/lib/i18n'
import { cargarInversiones } from '@/lib/investments-service'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Objetivos' }

/** Total de una magnitud en la divisa principal. Los libros no se mezclan. */
function enPrincipal(
  totales: { moneda: string; valor: number }[],
  principal: string
): number {
  return totales.find((t) => t.moneda === principal)?.valor ?? 0
}

export default async function GoalsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { monedas, idioma, xp } = await cargarContextoDeMonedas()
  const principal = monedas[0]
  const t = crearTraductor(idioma)

  const [datos, { patrimonio }, { resumen }, { objetivos, faltaMigracion }] = await Promise.all([
    cargarDatosDelDashboard(undefined, monedas),
    cargarCuentasYDeudas(supabase, monedas),
    cargarInversiones(supabase, monedas),
    cargarObjetivos(supabase),
  ])

  // Todo se mide en la divisa PRINCIPAL. Un objetivo de ahorro no puede
  // promediar una tasa en pesos con otra en dólares: serían dos números
  // distintos sumados como si fueran el mismo.
  const delMesPrincipal = datos.delMes.filter(
    (m) => (m.currency ?? 'ARS') === principal
  )

  const gastoPorCategoria = new Map<string, number>()
  for (const movimiento of delMesPrincipal) {
    if (movimiento.type !== 'EXPENSE' || !movimiento.category_id) continue
    gastoPorCategoria.set(
      movimiento.category_id,
      (gastoPorCategoria.get(movimiento.category_id) ?? 0) + Number(movimiento.amount)
    )
  }

  const base: BaseDeMedicion = {
    ingresosDelMes: enPrincipal(datos.ingresosDelMes, principal),
    gastosDelMes: enPrincipal(datos.gastosDelMes, principal),
    inversiones: enPrincipal(resumen.valorActual, principal),
    liquido: enPrincipal(patrimonio.liquido, principal),
    deuda:
      enPrincipal(patrimonio.deudaTarjetas, principal) +
      enPrincipal(patrimonio.deudaPersonal, principal),
    gastoPorCategoria,
  }

  const conAvance = objetivos.map((objetivo) =>
    calcularAvance(objetivo, medirObjetivo(objetivo, base))
  )

  const tier = tierPara(xp)
  const proximo = siguienteTier(xp)
  const avanceTier = avanceDentroDelTier(xp)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-on-background">
          <Target className="size-5 text-gold-leaf" aria-hidden />
          {t('objetivos.titulo')}
        </h1>
        <p className="text-xs leading-snug text-subtle">{t('objetivos.bajada')}</p>
      </div>

      {/* --- Tier: el reconocimiento, arriba de todo --------------------- */}
      <Card glass className="glow-gold flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <CardLabel className="text-gold-leaf">
            <Award className="size-3.5" aria-hidden />
            {t('tier.titulo')}
          </CardLabel>
          <span className="shrink-0 text-[11px] tabular-nums text-subtle">
            {xp} {t('tier.xp')}
          </span>
        </div>

        <p
          className="font-display text-[2rem] font-bold leading-tight tracking-tighter"
          style={{ color: tier.color }}
        >
          {tier.nombre}
        </p>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-gold-leaf/10"
          role="progressbar"
          aria-valuenow={Math.round(avanceTier * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('tier.titulo')}
        >
          <div
            className="fire-gradient h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.max(3, avanceTier * 100)}%` }}
          />
        </div>

        <p className="text-[11px] text-on-surface-variant">
          {proximo
            ? t('tier.siguiente', { xp: proximo.xp - xp, tier: proximo.nombre })
            : t('tier.maximo')}
        </p>

        {/* Las cinco insignias, para que se vea el camino completo. */}
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {TIERS.map((nivel) => {
            const alcanzado = xp >= nivel.xp

            return (
              <li
                key={nivel.codigo}
                title={`${nivel.nombre} · ${nivel.xp} XP`}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                  alcanzado
                    ? 'border-transparent text-midnight-navy'
                    : 'border-glass-stroke/50 text-subtle'
                }`}
                style={alcanzado ? { backgroundColor: nivel.color } : undefined}
              >
                {nivel.nombre}
              </li>
            )
          })}
        </ul>

        <div className="fire-gradient h-px w-full opacity-40" aria-hidden />

        <p className="text-[10px] leading-relaxed text-subtle">{t('tier.comoFunciona')}</p>
      </Card>

      <GoalsManager
        objetivos={conAvance}
        categorias={datos.categorias
          .filter((c) => c.type === 'EXPENSE')
          .map((c) => ({ id: c.id, nombre: c.name }))}
        contexto={{
          ingresosDelMes: base.ingresosDelMes,
          gastosDelMes: base.gastosDelMes,
          deuda: base.deuda,
          moneda: principal,
        }}
        faltaMigracion={faltaMigracion}
      />
    </div>
  )
}
