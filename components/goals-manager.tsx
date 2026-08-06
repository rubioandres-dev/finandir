'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, Loader2, Plus, Sparkles, Target, Trash2 } from 'lucide-react'
import { borrarObjetivo, registrarLogros } from '@/app/dashboard/goals/actions'
import { useFormatoRegional, useTraduccion } from '@/components/currency-provider'
import { GoalModal, type ContextoDeMetas } from '@/components/goal-modal'
import { Card, CardLabel } from '@/components/ui/card'
import {
  esDeMaximo,
  XP_POR_LOGRO,
  type ObjetivoConAvance,
  type TipoDeObjetivo,
} from '@/lib/goals-service'

/** Qué unidad tiene la meta de cada tipo. Define el sufijo y el paso del input. */
function unidadDe(tipo: TipoDeObjetivo): 'porcentaje' | 'meses' | 'monto' {
  if (tipo === 'SAVINGS_RATE' || tipo === 'INVESTMENT_RATE') return 'porcentaje'
  if (tipo === 'EMERGENCY_FUND') return 'meses'
  return 'monto'
}

export function GoalsManager({
  objetivos,
  contexto,
  faltaMigracion,
}: {
  objetivos: ObjetivoConAvance[]
  /** Ingresos, gastos y deuda reales: la carga dual los necesita para
   *  mostrar la contraparte de cada número. */
  contexto: ContextoDeMetas
  faltaMigracion: boolean
}) {
  const router = useRouter()
  const { t } = useTraduccion()
  const { formatearMonto } = useFormatoRegional()

  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()

  // Cumplidos que todavía no sumaron XP. El reclamo es explícito y no
  // automático: hacerlo en el render del servidor sería un efecto secundario
  // durante el render, y además el usuario se perdería el momento del logro.
  const reclamables = objetivos.filter((o) => o.cumplido && !o.achieved_at)

  function reclamar() {
    iniciar(async () => {
      await registrarLogros(reclamables.map((o) => o.id))
      router.refresh()
    })
  }

  function eliminar(id: string) {
    iniciar(async () => {
      const resultado = await borrarObjetivo(id)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      router.refresh()
    })
  }

  /** Cada tipo guarda su meta en su propia unidad: hay que mostrarla en esa. */
  function mostrarValor(objetivo: ObjetivoConAvance, numero: number): string {
    const u = unidadDe(objetivo.type)
    if (u === 'porcentaje') return `${numero}%`
    if (u === 'meses') return `${numero}`
    return formatearMonto(numero, objetivo.currency)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* --- Logros por reclamar ----------------------------------------- */}
      {reclamables.length > 0 && (
        <Card glass className="glow-gold flex flex-col gap-3 p-4">
          <CardLabel className="text-gold-leaf">
            <Sparkles className="size-3.5" aria-hidden />
            {reclamables.length === 1
              ? t('objetivos.cumplisteUno')
              : t('objetivos.cumplisteVarios', { cantidad: reclamables.length })}
          </CardLabel>

          <p className="text-xs leading-relaxed text-on-surface-variant">
            {t('objetivos.xpQueda', { xp: reclamables.length * XP_POR_LOGRO })}
          </p>

          <button
            type="button"
            onClick={reclamar}
            disabled={guardando}
            className="fire-gradient glow-gold flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60"
          >
            {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t('objetivos.reclamar', { xp: reclamables.length * XP_POR_LOGRO })}
          </button>
        </Card>
      )}

      {/* --- Alta -------------------------------------------------------- */}
      {faltaMigracion ? (
        <p className="rounded-xl border border-budget-warn/30 bg-budget-warn/10 px-3 py-2.5 text-xs leading-snug text-budget-warn">
          Los objetivos no se pueden guardar todavía: falta ejecutar{' '}
          <code className="font-mono">migrations/010_goals_and_aurem_tier.sql</code> en el SQL
          Editor de Supabase.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="btn-gold-subtle w-full cursor-pointer justify-center rounded-xl px-3 py-2.5 text-xs font-semibold"
        >
          <Plus className="size-4" aria-hidden />
          {t('objetivos.nuevo')}
        </button>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
        >
          {error}
        </p>
      )}

      {/* --- Listado ------------------------------------------------------ */}
      {objetivos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-glass-stroke/60 px-4 py-10 text-center text-sm text-subtle">
          {t('objetivos.sinObjetivos')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {objetivos.map((objetivo) => {
            const deMaximo = esDeMaximo(objetivo.type)
            // En los de techo, la barra en rojo cuando se pasó. En los de piso,
            // verde al llegar. El color dice el estado sin leer el número.
            const color = objetivo.cumplido
              ? deMaximo
                ? 'bg-budget-ok'
                : 'bg-budget-ok'
              : deMaximo
                ? 'bg-budget-over'
                : 'bg-gold-leaf'

            return (
              <li key={objetivo.id} className="glass-card flex flex-col gap-2 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-on-background">
                      <Target className="size-3.5 shrink-0 text-gold-leaf" aria-hidden />
                      {t(`objetivos.tipo.${objetivo.type}` as const)}
                    </span>
                    <span className="text-[11px] text-subtle">
                      {t('objetivos.actual')} {mostrarValor(objetivo, objetivo.medido)} ·{' '}
                      {t('objetivos.meta')} {mostrarValor(objetivo, objetivo.target_value)}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {objetivo.achieved_at && (
                      <span className="flex items-center gap-1 rounded-full bg-income/15 px-2 py-0.5 text-[10px] font-semibold text-income">
                        <Check className="size-3" aria-hidden />
                        {t('objetivos.logrado')}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => eliminar(objetivo.id)}
                      disabled={guardando}
                      aria-label={t('objetivos.borrar')}
                      className="grid size-7 cursor-pointer place-items-center rounded-md text-subtle transition hover:bg-expense/10 hover:text-expense"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </div>

                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
                  role="progressbar"
                  aria-valuenow={Math.round(objetivo.avance * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t(`objetivos.tipo.${objetivo.type}` as const)}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${color}`}
                    style={{ width: `${Math.max(3, objetivo.avance * 100)}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {abierto && (
        <GoalModal contexto={contexto} onCerrar={() => setAbierto(false)} />
      )}
    </div>
  )
}
