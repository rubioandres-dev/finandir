'use client'

import Link from 'next/link'
import { Target } from 'lucide-react'
import { useFormatoRegional, useTraduccion } from '@/components/currency-provider'
import type { AvanceDePresupuesto } from '@/lib/category-budgets-service'
import { IconoCategoria } from '@/lib/category-icons'

/** Se conserva el nombre para no tocar los imports; la forma la da el servicio. */
export type PresupuestoDeObjetivo = AvanceDePresupuesto

/**
 * Presupuestos del Home.
 *
 * FUENTE ÚNICA DESDE LA 013
 *
 * Había dos lugares donde definir el techo de gasto de una categoría: la tabla
 * `budgets` (de la 002), que editaba Ajustes, y los objetivos de tipo
 * CATEGORY_BUDGET (de la 010), que mostraba esta sección. Dos fuentes para el
 * mismo número es la receta de que digan cosas distintas, y eso es exactamente
 * lo que pasaba.
 *
 * Ahora las dos se unificaron en `category_budgets`. Ninguna fila se borró: los
 * objetivos migrados quedaron `is_active = false` y la tabla `budgets` sigue
 * intacta, así que volver atrás no necesita un backup.
 */
export function BudgetGoals({
  presupuestos,
}: {
  presupuestos: PresupuestoDeObjetivo[]
}) {
  const { t } = useTraduccion()
  const { formatearMonto } = useFormatoRegional()

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
          {t('presupuestos.titulo')}
        </h2>
        {/* Apunta a Ajustes y no a Objetivos: desde la 013 el techo de gasto se
            edita ahí, y ya no es una meta que sume XP. */}
        <Link
          href="/dashboard/settings#presupuestos"
          className="shrink-0 text-xs font-medium text-gold-leaf hover:underline"
        >
          {t('presupuestos.administrar')}
        </Link>
      </div>

      {presupuestos.length === 0 ? (
        <div className="flex flex-col items-start gap-2.5 rounded-2xl border border-dashed border-glass-stroke/60 px-4 py-5">
          <p className="text-xs leading-snug text-subtle">{t('presupuestos.sinObjetivos')}</p>
          <Link
            href="/dashboard/settings#presupuestos"
            className="btn-gold-subtle rounded-xl px-3 py-2 text-[11px] font-semibold"
          >
            <Target className="size-3.5" aria-hidden />
            {t('presupuestos.cargar')}
          </Link>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {presupuestos.map((presupuesto) => {
              const porcentaje =
                presupuesto.limite > 0 ? (presupuesto.gastado / presupuesto.limite) * 100 : 0
              const restante = presupuesto.limite - presupuesto.gastado

              // Mismas bandas que el resto de la app: verde <75%, ámbar hasta
              // el 100%, rojo al pasarse.
              const barra =
                porcentaje >= 100
                  ? 'bg-budget-over'
                  : porcentaje >= 75
                    ? 'bg-budget-warn'
                    : 'bg-budget-ok'
              const texto =
                porcentaje >= 100
                  ? 'text-expense'
                  : porcentaje >= 75
                    ? 'text-budget-warn'
                    : 'text-income'

              return (
                <li
                  key={presupuesto.categoriaId}
                  className="glass-card flex flex-col gap-2 rounded-2xl p-3.5"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-lg"
                      style={{
                        backgroundColor: `${presupuesto.color}22`,
                        color: presupuesto.color,
                      }}
                    >
                      <IconoCategoria icono={presupuesto.icono} className="size-3.5" />
                    </span>

                    <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight">
                      {presupuesto.nombre}
                    </span>

                    <span className={`shrink-0 text-xs font-semibold tabular-nums ${texto}`}>
                      {porcentaje.toFixed(0)}%
                    </span>
                  </div>

                  <p className="text-[11px] tabular-nums text-on-surface-variant">
                    {formatearMonto(presupuesto.gastado, presupuesto.moneda)}{' '}
                    <span className="text-subtle">{t('presupuestos.deLimite')}</span>{' '}
                    {formatearMonto(presupuesto.limite, presupuesto.moneda)}
                  </p>

                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
                    role="progressbar"
                    aria-valuenow={Math.round(porcentaje)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={presupuesto.nombre}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barra}`}
                      style={{ width: `${Math.min(porcentaje, 100)}%` }}
                    />
                  </div>

                  <p className="text-[11px] tabular-nums text-subtle">
                    {restante >= 0
                      ? t('presupuestos.quedan', {
                          monto: formatearMonto(restante, presupuesto.moneda),
                        })
                      : t('presupuestos.excedido', {
                          monto: formatearMonto(Math.abs(restante), presupuesto.moneda),
                        })}
                  </p>
                </li>
              )
            })}
          </ul>

          <Link
            href="/dashboard/goals"
            className="btn-gold-subtle w-full justify-center rounded-xl px-3 py-2.5 text-[11px] font-semibold"
          >
            <Target className="size-3.5" aria-hidden />
            {t('presupuestos.cargar')}
          </Link>
        </>
      )}
    </section>
  )
}
