'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, HandCoins, Loader2, Receipt } from 'lucide-react'
import { registrarSalida } from '@/app/dashboard/shared-expenses/actions'
import { useFormatoRegional, useModoMoneda, useTraduccion } from '@/components/currency-provider'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { hoyEnArgentina } from '@/lib/types'

const CAMPO =
  'rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-3 py-2 text-sm outline-none transition focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60'

/**
 * Dividir la cuenta y registrarla bien.
 *
 * LA PARTE QUE IMPORTA NO ES LA DIVISIÓN
 *
 * Dividir por N lo hace cualquier calculadora. Lo que ninguna resuelve es cómo
 * queda eso en tus finanzas cuando pagaste vos: si registrás el total como
 * gasto, tu mes se ve peor de lo que fue; si registrás solo tu parte, la plata
 * que salió del banco no cuadra. Y si después contás la devolución como
 * ingreso, tu tasa de ahorro se infla con plata que nunca ganaste.
 *
 * Por eso hay dos opciones y no un botón de "guardar".
 */
export function NightOutCalculator() {
  const router = useRouter()
  const { t } = useTraduccion()
  const { modo } = useModoMoneda()
  const { formatearMonto } = useFormatoRegional()

  const [total, setTotal] = useState('')
  const [personas, setPersonas] = useState('2')
  const [propina, setPropina] = useState('10')
  const [descripcion, setDescripcion] = useState('')
  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enVuelo, iniciar] = useTransition()

  const totalNumero = Number(total.replace(',', '.')) || 0
  const cantidad = Math.max(1, Math.round(Number(personas) || 1))
  const propinaNumero = Math.max(0, Number(propina.replace(',', '.')) || 0)

  const conPropina = Math.round(totalNumero * (1 + propinaNumero / 100) * 100) / 100
  const porPersona = Math.round((conPropina / cantidad) * 100) / 100
  const hayCuenta = totalNumero > 0

  function registrar(modoRegistro: 'TOTAL' | 'SOLO_MI_PARTE') {
    setError(null)

    iniciar(async () => {
      const resultado = await registrarSalida({
        total: conPropina,
        miParte: porPersona,
        descripcion: descripcion.trim() || 'Salida compartida',
        moneda: modo,
        fecha: hoyEnArgentina(),
        modo: modoRegistro,
      })

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      setListo(true)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <CardLabel>
            <Receipt className="size-3.5 text-gold-leaf" aria-hidden />
            {t('calculadora.titulo')}
          </CardLabel>

          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('calculadora.total')}
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                autoFocus
                disabled={enVuelo}
                className={`${CAMPO} flex-1 tabular-nums`}
              />
              <span className="shrink-0 text-sm text-subtle">{modo}</span>
            </div>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              {t('calculadora.personas')}
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="100"
                value={personas}
                onChange={(e) => setPersonas(e.target.value)}
                disabled={enVuelo}
                className={`${CAMPO} tabular-nums`}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              {t('calculadora.propina')} (%)
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                value={propina}
                onChange={(e) => setPropina(e.target.value)}
                disabled={enVuelo}
                className={`${CAMPO} tabular-nums`}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* --- Resultado ------------------------------------------------------ */}
      {hayCuenta && (
        <Card glass className="glow-gold flex flex-col gap-2 p-5">
          <CardLabel className="text-gold-leaf">{t('calculadora.porPersona')}</CardLabel>
          <p className="font-display text-[2rem] font-bold leading-tight tracking-tighter tabular-nums text-gold-leaf">
            {formatearMonto(porPersona, modo)}
          </p>
          <p className="text-[11px] tabular-nums text-on-surface-variant">
            {t('calculadora.conPropina')}: {formatearMonto(conPropina, modo)} ÷ {cantidad}
          </p>
        </Card>
      )}

      {/* --- Registro ------------------------------------------------------- */}
      {hayCuenta && !listo && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <CardLabel>{t('calculadora.comoRegistrar')}</CardLabel>

            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={120}
              placeholder={t('calculadora.descripcion')}
              disabled={enVuelo}
              className={CAMPO}
            />

            <button
              type="button"
              onClick={() => registrar('TOTAL')}
              disabled={enVuelo}
              className="flex cursor-pointer flex-col gap-1.5 rounded-xl border border-glass-stroke/50 p-3.5 text-left transition hover:border-gold-leaf/60 disabled:opacity-60"
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold text-gold-leaf">
                <HandCoins className="size-4 shrink-0" aria-hidden />
                {t('calculadora.opcionA')}
              </span>
              <span className="text-[11px] leading-relaxed text-subtle">
                {t('calculadora.opcionADetalle')}
              </span>
              <span className="text-[11px] tabular-nums text-on-surface-variant">
                −{formatearMonto(conPropina, modo)} · {formatearMonto(porPersona, modo)}{' '}
                {t('dashboard.gastos').toLowerCase()} ·{' '}
                {formatearMonto(conPropina - porPersona, modo)} {t('compartidos.teDeben').toLowerCase()}
              </span>
            </button>

            <button
              type="button"
              onClick={() => registrar('SOLO_MI_PARTE')}
              disabled={enVuelo}
              className="flex cursor-pointer flex-col gap-1.5 rounded-xl border border-glass-stroke/50 p-3.5 text-left transition hover:border-gold-leaf/60 disabled:opacity-60"
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold text-gold-leaf">
                <Receipt className="size-4 shrink-0" aria-hidden />
                {t('calculadora.opcionB')}
              </span>
              <span className="text-[11px] leading-relaxed text-subtle">
                {t('calculadora.opcionBDetalle')}
              </span>
              <span className="text-[11px] tabular-nums text-on-surface-variant">
                −{formatearMonto(porPersona, modo)}
              </span>
            </button>

            {enVuelo && (
              <p className="flex items-center gap-1.5 text-[11px] text-subtle">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                {t('comun.guardando')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {listo && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-income/30 bg-income/10 px-3.5 py-3 text-sm text-income"
        >
          <Check className="size-4 shrink-0" aria-hidden />
          {t('calculadora.registrado')}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
        >
          {error}
        </p>
      )}
    </div>
  )
}
