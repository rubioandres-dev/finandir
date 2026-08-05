'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowRight, Loader2, Plus, QrCode, Scale, Users } from 'lucide-react'
import { crearGastoCompartido } from '@/app/dashboard/shared-expenses/actions'
import { useFormatoRegional, useTraduccion } from '@/components/currency-provider'
import { QrInviteModal } from '@/components/qr-invite'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import type {
  Balance,
  Espacio,
  GastoCompartido,
  Miembro,
  Transferencia,
} from '@/lib/shared-expenses-service'
import { hoyEnArgentina } from '@/lib/types'

const CAMPO =
  'rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-3 py-2 text-sm outline-none transition focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60'

export function SharedSpaceDetail({
  espacio,
  miembros,
  gastos,
  balances,
  liquidacion,
  nombres,
  usuarioId,
}: {
  espacio: Espacio
  miembros: Miembro[]
  gastos: GastoCompartido[]
  balances: Balance[]
  liquidacion: Transferencia[]
  /** user_id → nombre para mostrar. Se arma en el servidor. */
  nombres: Record<string, string>
  usuarioId: string
}) {
  const router = useRouter()
  const { t } = useTraduccion()
  const { formatearMonto, formatearFecha } = useFormatoRegional()

  const [qrAbierto, setQrAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [pagadoPor, setPagadoPor] = useState(usuarioId)
  // Porcentaje por miembro. Arranca en partes iguales, que es el caso normal.
  const [reparto, setReparto] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      miembros.map((m) => [m.user_id, Math.round((100 / miembros.length) * 10) / 10])
    )
  )
  const [error, setError] = useState<string | null>(null)
  const [enVuelo, iniciar] = useTransition()

  const nombre = (id: string) => nombres[id] ?? 'Alguien'
  const suma = Object.values(reparto).reduce((s, v) => s + v, 0)
  const miBalance = balances.find((b) => b.user_id === usuarioId)?.balance ?? 0

  function partesIguales() {
    const parte = Math.round((100 / miembros.length) * 10) / 10
    setReparto(Object.fromEntries(miembros.map((m) => [m.user_id, parte])))
  }

  function guardar() {
    const importe = Number(monto.replace(',', '.'))

    if (!Number.isFinite(importe) || importe <= 0) {
      setError('El importe tiene que ser mayor a cero.')
      return
    }
    if (Math.abs(suma - 100) > 0.5) {
      setError(t('compartidos.sumaCien', { suma: suma.toFixed(1) }))
      return
    }

    setError(null)
    iniciar(async () => {
      const resultado = await crearGastoCompartido({
        spaceId: espacio.id,
        pagadoPor,
        monto: importe,
        descripcion: descripcion.trim() || 'Gasto compartido',
        fecha: hoyEnArgentina(),
        repartos: miembros.map((m) => ({
          user_id: m.user_id,
          percentage: reparto[m.user_id] ?? 0,
        })),
      })

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      setCargando(false)
      setMonto('')
      setDescripcion('')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* --- Balance propio ------------------------------------------------ */}
      <Card glass className="glow-gold flex flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-3">
          <CardLabel className="text-gold-leaf">
            <Scale className="size-3.5" aria-hidden />
            {t('compartidos.tuBalance')}
          </CardLabel>
          <button
            type="button"
            onClick={() => setQrAbierto(true)}
            className="btn-gold-subtle shrink-0 cursor-pointer rounded-xl px-2.5 py-1.5 text-[11px] font-semibold"
          >
            <QrCode className="size-3.5" aria-hidden />
            QR
          </button>
        </div>

        <p
          className={`font-display text-[2rem] font-bold leading-tight tracking-tighter tabular-nums ${
            miBalance < -0.005 ? 'text-expense' : 'text-gold-leaf'
          }`}
        >
          {formatearMonto(Math.abs(miBalance), espacio.currency)}
        </p>
        <p className="text-[11px] text-on-surface-variant">
          {Math.abs(miBalance) < 0.005
            ? t('compartidos.balanceCero')
            : miBalance > 0
              ? t('compartidos.teDeben')
              : t('compartidos.debes')}
        </p>

        <div className="fire-gradient mt-2 h-px w-full opacity-40" aria-hidden />

        <p className="flex items-center gap-1.5 text-[11px] text-subtle">
          <Users className="size-3" aria-hidden />
          {t('compartidos.miembros', { cantidad: miembros.length })}
        </p>
      </Card>

      {/* --- Liquidación --------------------------------------------------- */}
      <section className="flex flex-col gap-2.5">
        <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
          {t('compartidos.saldar')}
        </h2>

        {liquidacion.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-glass-stroke/60 px-4 py-6 text-center text-xs text-subtle">
            {t('compartidos.balanceCero')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {liquidacion.map((paso, indice) => (
              <li
                key={`${paso.de}-${paso.a}-${indice}`}
                className="flex items-center gap-2.5 rounded-xl border border-glass-stroke/40 px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-on-surface-variant">
                  {nombre(paso.de)}
                </span>
                <ArrowRight className="size-3.5 shrink-0 text-gold-leaf" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs text-on-surface-variant">
                  {nombre(paso.a)}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-gold-leaf">
                  {formatearMonto(paso.monto, espacio.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Alta de gasto -------------------------------------------------- */}
      {cargando ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <CardLabel>{t('compartidos.nuevoGasto')}</CardLabel>

            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={120}
              autoFocus
              placeholder={t('comun.descripcion')}
              disabled={enVuelo}
              className={CAMPO}
            />

            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder={t('comun.importe')}
                disabled={enVuelo}
                className={`${CAMPO} flex-1 tabular-nums`}
              />
              <span className="shrink-0 text-sm text-subtle">{espacio.currency}</span>
            </div>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              {t('compartidos.pagadoPor')}
              <select
                value={pagadoPor}
                onChange={(e) => setPagadoPor(e.target.value)}
                disabled={enVuelo}
                className={CAMPO}
              >
                {miembros.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {nombre(m.user_id)}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted">{t('compartidos.reparto')}</span>
              <button
                type="button"
                onClick={partesIguales}
                disabled={enVuelo}
                className="cursor-pointer text-[11px] font-medium text-gold-leaf hover:underline"
              >
                {t('compartidos.partesIguales')}
              </button>
            </div>

            <ul className="flex flex-col gap-1.5">
              {miembros.map((m) => (
                <li key={m.user_id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-on-surface-variant">
                    {nombre(m.user_id)}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.1"
                    value={reparto[m.user_id] ?? 0}
                    onChange={(e) =>
                      setReparto((previo) => ({
                        ...previo,
                        [m.user_id]: Number(e.target.value) || 0,
                      }))
                    }
                    disabled={enVuelo}
                    className={`${CAMPO} w-20 text-right tabular-nums`}
                  />
                  <span className="shrink-0 text-xs text-subtle">%</span>
                </li>
              ))}
            </ul>

            <p
              className={`text-[11px] tabular-nums ${
                Math.abs(suma - 100) > 0.5 ? 'text-expense' : 'text-subtle'
              }`}
            >
              {suma.toFixed(1)}%
            </p>

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
                onClick={() => setCargando(false)}
                disabled={enVuelo}
                className="cursor-pointer rounded-lg border border-glass-stroke/50 px-3 py-2.5 text-sm font-medium text-on-surface-variant transition hover:border-gold-leaf/60 disabled:opacity-60"
              >
                {t('comun.cancelar')}
              </button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setCargando(true)}
          className="btn-gold-subtle w-full cursor-pointer justify-center rounded-xl px-3 py-2.5 text-xs font-semibold"
        >
          <Plus className="size-4" aria-hidden />
          {t('compartidos.nuevoGasto')}
        </button>
      )}

      {/* --- Gastos --------------------------------------------------------- */}
      <section className="flex flex-col gap-2.5">
        <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
          {t('compartidos.totalGrupo')}{' '}
          <span className="tabular-nums text-gold-leaf">
            {formatearMonto(
              gastos.reduce((s, g) => s + g.amount, 0),
              espacio.currency
            )}
          </span>
        </h2>

        {gastos.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-glass-stroke/60 px-4 py-8 text-center text-xs text-subtle">
            {t('compartidos.sinGastos')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-glass-stroke/25">
            {gastos.map((gasto) => (
              <li key={gasto.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-on-background">{gasto.description}</span>
                  <span className="truncate text-[11px] text-subtle">
                    {t('compartidos.pagadoPor')} {nombre(gasto.paid_by)} ·{' '}
                    {formatearFecha(gasto.date)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-on-background">
                  {formatearMonto(gasto.amount, espacio.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {qrAbierto && <QrInviteModal spaceId={espacio.id} onCerrar={() => setQrAbierto(false)} />}
    </div>
  )
}
