'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowRight, Loader2, Plus, QrCode, Scale, UserPlus, Users } from 'lucide-react'
import {
  agregarInvitado,
  crearGastoCompartido,
  registrarPago,
} from '@/app/dashboard/shared-expenses/actions'
import { useFormatoRegional, useTraduccion } from '@/components/currency-provider'
import { QrInviteModal } from '@/components/qr-invite'
import { SharedSpaceGoals } from '@/components/shared-space-goals'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { porcentajesIguales } from '@/lib/shared-expenses-service'
import type {
  Balance,
  Espacio,
  GastoCompartido,
  Liquidacion,
  Miembro,
  ObjetivoDeGrupo,
  Transferencia,
} from '@/lib/shared-expenses-service'
import { hoyEnArgentina } from '@/lib/types'

const CAMPO =
  'rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-3 py-2 text-sm outline-none transition focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60'

/**
 * Detalle de un grupo.
 *
 * TODO SE IDENTIFICA POR MIEMBRO, NO POR USUARIO
 *
 * Desde la 015 un participante puede no tener cuenta en AUREM. Por eso los
 * selects, el reparto y los saldos van contra `member.id` y no contra
 * `user_id`: un invitado no tiene `user_id`, y si la clave fuera esa,
 * simplemente no podría participar de un gasto.
 */
export function SharedSpaceDetail({
  espacio,
  miembros,
  gastos,
  liquidaciones,
  objetivos,
  balances,
  liquidacion,
  nombres,
  miMiembroId,
}: {
  espacio: Espacio
  miembros: Miembro[]
  gastos: GastoCompartido[]
  liquidaciones: Liquidacion[]
  objetivos: ObjetivoDeGrupo[]
  balances: Balance[]
  liquidacion: Transferencia[]
  /** member_id → nombre para mostrar. Se arma en el servidor. */
  nombres: Record<string, string>
  /** Mi fila de miembro en este grupo. `null` no debería pasar: la página redirige. */
  miMiembroId: string | null
}) {
  const router = useRouter()
  const { t } = useTraduccion()
  const { formatearMonto, formatearFecha } = useFormatoRegional()

  const [qrAbierto, setQrAbierto] = useState(false)
  const [panel, setPanel] = useState<'ninguno' | 'gasto' | 'invitado' | 'pago'>('ninguno')
  const [error, setError] = useState<string | null>(null)
  const [enVuelo, iniciar] = useTransition()

  // --- Gasto ---------------------------------------------------------------
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [pagadoPor, setPagadoPor] = useState(miMiembroId ?? miembros[0]?.id ?? '')
  const [reparto, setReparto] = useState<Record<string, number>>(() =>
    Object.fromEntries(porcentajesIguales(miembros.map((m) => m.id)).map((p) => [p.member_id, p.percentage]))
  )

  // --- Invitado ------------------------------------------------------------
  const [nombreInvitado, setNombreInvitado] = useState('')

  // --- Pago ----------------------------------------------------------------
  const [pagoDe, setPagoDe] = useState(miMiembroId ?? miembros[0]?.id ?? '')
  const [pagoA, setPagoA] = useState(miembros.find((m) => m.id !== miMiembroId)?.id ?? '')
  const [pagoMonto, setPagoMonto] = useState('')

  const nombre = (id: string) => nombres[id] ?? 'Alguien'
  const suma = Object.values(reparto).reduce((s, v) => s + v, 0)
  const miBalance = balances.find((b) => b.member_id === miMiembroId)?.balance ?? 0

  function partesIguales() {
    setReparto(
      Object.fromEntries(
        porcentajesIguales(miembros.map((m) => m.id)).map((p) => [p.member_id, p.percentage])
      )
    )
  }

  function cerrarPanel() {
    setPanel('ninguno')
    setError(null)
  }

  function guardarGasto() {
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
        // El reparto se guarda como porcentaje; `split_type` recuerda cómo lo
        // eligió el usuario para poder reabrir el formulario igual.
        tipoDeReparto: Math.abs(suma - 100) < 0.001 && new Set(Object.values(reparto)).size === 1
          ? 'EQUAL'
          : 'PERCENTAGE',
        monto: importe,
        descripcion: descripcion.trim() || 'Gasto compartido',
        fecha: hoyEnArgentina(),
        repartos: miembros.map((m) => ({ member_id: m.id, percentage: reparto[m.id] ?? 0 })),
      })

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      cerrarPanel()
      setMonto('')
      setDescripcion('')
      router.refresh()
    })
  }

  function guardarInvitado() {
    if (!nombreInvitado.trim()) {
      setError(t('compartidos.nombreInvitadoVacio'))
      return
    }

    setError(null)
    iniciar(async () => {
      const resultado = await agregarInvitado({
        spaceId: espacio.id,
        nombre: nombreInvitado.trim(),
      })

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      cerrarPanel()
      setNombreInvitado('')
      router.refresh()
    })
  }

  function guardarPago() {
    const importe = Number(pagoMonto.replace(',', '.'))

    if (!Number.isFinite(importe) || importe <= 0) {
      setError('El importe tiene que ser mayor a cero.')
      return
    }
    if (pagoDe === pagoA) {
      setError(t('compartidos.pagoMismaPersona'))
      return
    }

    setError(null)
    iniciar(async () => {
      const resultado = await registrarPago({
        spaceId: espacio.id,
        deMiembro: pagoDe,
        aMiembro: pagoA,
        monto: importe,
        moneda: espacio.currency,
      })

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      cerrarPanel()
      setPagoMonto('')
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

      {/* --- Liquidación pendiente ----------------------------------------- */}
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

      {/* --- Acciones ------------------------------------------------------ */}
      {panel === 'ninguno' && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setPanel('gasto')}
            className="btn-gold-subtle cursor-pointer justify-center rounded-xl px-3 py-2.5 text-xs font-semibold"
          >
            <Plus className="size-4" aria-hidden />
            {t('compartidos.nuevoGasto')}
          </button>
          <button
            type="button"
            onClick={() => setPanel('pago')}
            className="cursor-pointer rounded-xl border border-glass-stroke/50 px-3 py-2.5 text-xs font-medium text-on-surface-variant transition hover:border-gold-leaf/60 hover:text-gold-leaf"
          >
            {t('compartidos.registrarPago')}
          </button>
          <button
            type="button"
            onClick={() => setPanel('invitado')}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-glass-stroke/50 px-3 py-2.5 text-xs font-medium text-on-surface-variant transition hover:border-gold-leaf/60 hover:text-gold-leaf"
          >
            <UserPlus className="size-4" aria-hidden />
            {t('compartidos.agregarInvitado')}
          </button>
        </div>
      )}

      {/* --- Alta de gasto -------------------------------------------------- */}
      {panel === 'gasto' && (
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
                  <option key={m.id} value={m.id}>
                    {nombre(m.id)}
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
                <li key={m.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-on-surface-variant">
                    {nombre(m.id)}
                    {m.user_id === null && (
                      <span className="ml-1.5 text-[10px] text-subtle">
                        {t('compartidos.invitado')}
                      </span>
                    )}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.1"
                    value={reparto[m.id] ?? 0}
                    onChange={(e) =>
                      setReparto((previo) => ({ ...previo, [m.id]: Number(e.target.value) || 0 }))
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

            <Acciones onGuardar={guardarGasto} onCancelar={cerrarPanel} enVuelo={enVuelo} />
          </CardContent>
        </Card>
      )}

      {/* --- Invitado sin cuenta -------------------------------------------- */}
      {panel === 'invitado' && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <CardLabel>{t('compartidos.agregarInvitado')}</CardLabel>
            <p className="text-[11px] leading-snug text-subtle">
              {t('compartidos.invitadoAyuda')}
            </p>

            <input
              type="text"
              value={nombreInvitado}
              onChange={(e) => setNombreInvitado(e.target.value)}
              maxLength={100}
              autoFocus
              placeholder={t('comun.nombre')}
              disabled={enVuelo}
              className={CAMPO}
            />

            {error && (
              <p role="alert" className="text-[11px] text-expense">
                {error}
              </p>
            )}

            <Acciones onGuardar={guardarInvitado} onCancelar={cerrarPanel} enVuelo={enVuelo} />
          </CardContent>
        </Card>
      )}

      {/* --- Registrar un pago ---------------------------------------------- */}
      {panel === 'pago' && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <CardLabel>{t('compartidos.registrarPago')}</CardLabel>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                {t('compartidos.paga')}
                <select
                  value={pagoDe}
                  onChange={(e) => setPagoDe(e.target.value)}
                  disabled={enVuelo}
                  className={CAMPO}
                >
                  {miembros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {nombre(m.id)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                {t('compartidos.cobra')}
                <select
                  value={pagoA}
                  onChange={(e) => setPagoA(e.target.value)}
                  disabled={enVuelo}
                  className={CAMPO}
                >
                  {miembros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {nombre(m.id)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={pagoMonto}
                onChange={(e) => setPagoMonto(e.target.value)}
                placeholder={t('comun.importe')}
                disabled={enVuelo}
                className={`${CAMPO} flex-1 tabular-nums`}
              />
              <span className="shrink-0 text-sm text-subtle">{espacio.currency}</span>
            </div>

            {error && (
              <p role="alert" className="text-[11px] text-expense">
                {error}
              </p>
            )}

            <Acciones onGuardar={guardarPago} onCancelar={cerrarPanel} enVuelo={enVuelo} />
          </CardContent>
        </Card>
      )}

      {/* --- Objetivos del grupo --------------------------------------------- */}
      <SharedSpaceGoals espacio={espacio} objetivos={objetivos} gastos={gastos} />

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
                    {t('compartidos.pagadoPor')} {nombre(gasto.paid_by_member_id)} ·{' '}
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

      {/* --- Pagos registrados ------------------------------------------------ */}
      {liquidaciones.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
            {t('compartidos.pagosRegistrados')}
          </h2>
          <ul className="flex flex-col divide-y divide-glass-stroke/25">
            {liquidaciones.map((pago) => (
              <li key={pago.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate text-[11px] text-on-surface-variant">
                  {nombre(pago.from_member_id)} → {nombre(pago.to_member_id)}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-income">
                  {formatearMonto(pago.amount, pago.currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {qrAbierto && <QrInviteModal spaceId={espacio.id} onCerrar={() => setQrAbierto(false)} />}
    </div>
  )
}

/** Guardar / cancelar: los tres paneles comparten el mismo par de botones. */
function Acciones({
  onGuardar,
  onCancelar,
  enVuelo,
}: {
  onGuardar: () => void
  onCancelar: () => void
  enVuelo: boolean
}) {
  const { t } = useTraduccion()

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onGuardar}
        disabled={enVuelo}
        className="fire-gradient glow-gold flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60"
      >
        {enVuelo && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {t('comun.guardar')}
      </button>
      <button
        type="button"
        onClick={onCancelar}
        disabled={enVuelo}
        className="cursor-pointer rounded-lg border border-glass-stroke/50 px-3 py-2.5 text-sm font-medium text-on-surface-variant transition hover:border-gold-leaf/60 disabled:opacity-60"
      >
        {t('comun.cancelar')}
      </button>
    </div>
  )
}
