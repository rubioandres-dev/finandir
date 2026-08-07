'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, PiggyBank, Plus, Target, Trash2 } from 'lucide-react'
import {
  borrarObjetivoDeGrupo,
  guardarObjetivoDeGrupo,
} from '@/app/dashboard/shared-expenses/actions'
import { useFormatoRegional, useTraduccion } from '@/components/currency-provider'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { gastoPorCategoria } from '@/lib/shared-expenses-service'
import type { Espacio, GastoCompartido, ObjetivoDeGrupo } from '@/lib/shared-expenses-service'

const CAMPO =
  'rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-3 py-2 text-sm outline-none transition focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60'

/**
 * Objetivos del grupo: techos de gasto por categoría y metas de ahorro.
 *
 * POR QUÉ NO SON LOS MISMOS QUE LOS PERSONALES
 *
 * El techo de gasto de una casa compartida no es el techo de ninguno de sus
 * integrantes: los $200.000 de supermercado del departamento no son los
 * $200.000 de supermercado de uno solo. Meterlos en `category_budgets` haría
 * que cada miembro viera el gasto del grupo entero contra su presupuesto
 * personal, contando dos veces la misma plata.
 *
 * QUÉ SE MIDE Y QUÉ NO
 *
 * Los presupuestos por categoría se miden contra los gastos cargados EN EL
 * GRUPO. Las metas de ahorro no se miden: no hay una cuenta del grupo de dónde
 * leer un saldo, así que muestran el objetivo y el aporte mensual pactado y
 * nada más. Fingir un avance calculado sería inventarlo.
 */
export function SharedSpaceGoals({
  espacio,
  objetivos,
  gastos,
}: {
  espacio: Espacio
  objetivos: ObjetivoDeGrupo[]
  gastos: GastoCompartido[]
}) {
  const router = useRouter()
  const { t } = useTraduccion()
  const { formatearMonto } = useFormatoRegional()

  const [abierto, setAbierto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<ObjetivoDeGrupo['type']>('GROUP_SAVINGS')
  const [monto, setMonto] = useState('')
  const [aporte, setAporte] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enVuelo, iniciar] = useTransition()

  const gastado = gastoPorCategoria(gastos)

  function guardar() {
    const importe = Number(monto.replace(',', '.'))

    if (!titulo.trim()) {
      setError(t('grupoObjetivos.sinTitulo'))
      return
    }
    if (!Number.isFinite(importe) || importe <= 0) {
      setError('La meta tiene que ser mayor a cero.')
      return
    }
    // Un presupuesto por categoría necesita elegir la categoría, y este panel
    // todavía no tiene ese selector: se ofrece sólo el ahorro conjunto.
    if (tipo === 'CATEGORY_BUDGET') {
      setError(t('grupoObjetivos.presupuestoNoDisponible'))
      return
    }

    const aporteMensual = aporte.trim() === '' ? null : Number(aporte.replace(',', '.'))

    setError(null)
    iniciar(async () => {
      const resultado = await guardarObjetivoDeGrupo({
        spaceId: espacio.id,
        titulo: titulo.trim(),
        tipo,
        monto: importe,
        aporteMensual: Number.isFinite(aporteMensual as number) ? aporteMensual : null,
        moneda: espacio.currency,
      })

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      setAbierto(false)
      setTitulo('')
      setMonto('')
      setAporte('')
      router.refresh()
    })
  }

  function borrar(id: string) {
    iniciar(async () => {
      const resultado = await borrarObjetivoDeGrupo(espacio.id, id)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
          {t('grupoObjetivos.titulo')}
        </h2>
        {!abierto && (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-medium text-gold-leaf hover:underline"
          >
            <Plus className="size-3" aria-hidden />
            {t('grupoObjetivos.nuevo')}
          </button>
        )}
      </div>

      {abierto && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <CardLabel>{t('grupoObjetivos.nuevo')}</CardLabel>

            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={100}
              autoFocus
              placeholder={t('grupoObjetivos.placeholderTitulo')}
              disabled={enVuelo}
              className={CAMPO}
            />

            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              {t('objetivos.tipoCampo')}
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as ObjetivoDeGrupo['type'])}
                disabled={enVuelo}
                className={CAMPO}
              >
                <option value="GROUP_SAVINGS">{t('grupoObjetivos.tipoAhorro')}</option>
                <option value="CATEGORY_BUDGET">{t('grupoObjetivos.tipoPresupuesto')}</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                {t('objetivos.meta')}
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  disabled={enVuelo}
                  className={`${CAMPO} tabular-nums`}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                {t('grupoObjetivos.aporteMensual')}
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={aporte}
                  onChange={(e) => setAporte(e.target.value)}
                  disabled={enVuelo}
                  className={`${CAMPO} tabular-nums`}
                />
              </label>
            </div>

            {error && (
              <p role="alert" className="text-[11px] text-expense">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={guardar}
                disabled={enVuelo}
                className="fire-gradient glow-gold flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60"
              >
                {enVuelo && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {t('comun.guardar')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAbierto(false)
                  setError(null)
                }}
                disabled={enVuelo}
                className="cursor-pointer rounded-lg border border-glass-stroke/50 px-3 py-2.5 text-sm font-medium text-on-surface-variant transition hover:border-gold-leaf/60 disabled:opacity-60"
              >
                {t('comun.cancelar')}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {objetivos.length === 0 && !abierto ? (
        <p className="rounded-2xl border border-dashed border-glass-stroke/60 px-4 py-6 text-center text-xs text-subtle">
          {t('grupoObjetivos.sinObjetivos')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {objetivos.map((objetivo) => {
            const esPresupuesto = objetivo.type === 'CATEGORY_BUDGET'
            const consumido = esPresupuesto
              ? (gastado.get(objetivo.category_id ?? '') ?? 0)
              : null
            const avance =
              consumido === null || objetivo.target_amount <= 0
                ? null
                : Math.min(1, consumido / objetivo.target_amount)

            return (
              <li
                key={objetivo.id}
                className="flex flex-col gap-2 rounded-xl border border-glass-stroke/40 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  {esPresupuesto ? (
                    <Target className="size-3.5 shrink-0 text-budget-warn" aria-hidden />
                  ) : (
                    <PiggyBank className="size-3.5 shrink-0 text-gold-leaf" aria-hidden />
                  )}

                  <span className="min-w-0 flex-1 truncate text-sm text-on-background">
                    {objetivo.title}
                  </span>

                  <span className="shrink-0 text-sm font-semibold tabular-nums text-gold-leaf">
                    {formatearMonto(objetivo.target_amount, objetivo.currency)}
                  </span>

                  <button
                    type="button"
                    onClick={() => borrar(objetivo.id)}
                    disabled={enVuelo}
                    aria-label={t('comun.borrar')}
                    className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-subtle transition hover:bg-expense/10 hover:text-expense disabled:opacity-50"
                  >
                    <Trash2 className="size-3" aria-hidden />
                  </button>
                </div>

                {avance !== null && (
                  <div
                    className="h-1 w-full overflow-hidden rounded-full bg-foreground/10"
                    role="progressbar"
                    aria-valuenow={Math.round(avance * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={objetivo.title}
                  >
                    <div
                      className={`h-full rounded-full transition-all ${
                        avance >= 1 ? 'bg-budget-over' : 'bg-budget-ok'
                      }`}
                      style={{ width: `${avance * 100}%` }}
                    />
                  </div>
                )}

                {objetivo.monthly_contribution !== null && (
                  <p className="text-[10px] tabular-nums text-subtle">
                    {t('grupoObjetivos.aporteMensual')}:{' '}
                    {formatearMonto(objetivo.monthly_contribution, objetivo.currency)}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
