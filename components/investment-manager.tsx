'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { Loader2, Lock, Pencil, Plus, Trash2, X, Zap } from 'lucide-react'
import {
  borrarInversion,
  guardarInversion,
  type InversionAGuardar,
} from '@/app/dashboard/investments/actions'
import { CurrencyOptions } from '@/components/currency-options'
import { useModoMoneda, useFormatoRegional, useTraduccion } from '@/components/currency-provider'
import { rendimientoMensualDe } from '@/lib/investments-service'
import {
  type Inversion,
  type Moneda,
  type PlazoDeLiquidez,
  type TipoDeActivo,
} from '@/lib/types'
import { useCierreConAtras } from '@/lib/use-cierre-con-atras'

/**
 * Cada tipo de activo con el plazo que le corresponde casi siempre.
 *
 * EL BADGE PRESELECCIONA, NO DECIDE
 *
 * Elegir "Money market" pone T+0 solo, pero el campo de liquidez sigue visible y
 * se puede cambiar. Fijarlo habría sido más simple de usar y habría dejado de
 * poder representar casos reales: un CEDEAR liquida T+1 o T+2 según el broker,
 * y cripto en una cold wallet no se rescata el mismo día aunque el mercado esté
 * abierto 24/7.
 *
 * El orden es el de uso, no el alfabético: money market primero porque es lo
 * que más se carga y lo único que suma a la liquidez del inicio.
 */
const TIPOS: { tipo: TipoDeActivo; plazo: PlazoDeLiquidez }[] = [
  { tipo: 'MONEY_MARKET', plazo: 'T0' },
  { tipo: 'FIXED_INCOME', plazo: 'T1' },
  { tipo: 'TIME_DEPOSIT', plazo: 'LOCKED' },
  { tipo: 'STOCKS_CEDEARS', plazo: 'T2' },
  { tipo: 'CRYPTO', plazo: 'T0' },
  { tipo: 'REAL_ESTATE', plazo: 'LOCKED' },
]

const PLAZOS: PlazoDeLiquidez[] = ['T0', 'T1', 'T2', 'LOCKED']

const CAMPO =
  'rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary'
const ETIQUETA = 'flex flex-col gap-1 text-xs font-medium text-muted'

/** "1234,5" -> 1234.5; vacío o basura -> null. */
function aNumero(valor: string): number | null {
  const limpio = valor.trim().replace(',', '.')
  if (limpio === '') return null
  const numero = Number(limpio)
  return Number.isFinite(numero) ? numero : null
}

function monedaDe(inversion: Inversion): Moneda {
  return inversion.currency?.trim() === 'USD' ? 'USD' : 'ARS'
}

/**
 * Formulario de alta y edición, en un diálogo por encima de todo.
 *
 * A diferencia de los formularios inline del resto de la app, este se abre
 * como modal porque también se entra desde el lápiz de una fila: un panel que
 * empuja el listado haría saltar la fila que se está editando.
 */
function FormularioDeInversion({
  inversion,
  onCerrar,
}: {
  /** Presente = edición. Ausente = alta. */
  inversion?: Inversion
  onCerrar: () => void
}) {
  // Atrás cierra el modal, no la app.
  useCierreConAtras(true, onCerrar)

  const { t } = useTraduccion()
  const { formatearMonto } = useFormatoRegional()
  const router = useRouter()
  const editando = inversion != null

  const [guardando, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [nombre, setNombre] = useState(inversion?.name ?? '')
  const [tipo, setTipo] = useState<TipoDeActivo>(inversion?.asset_type ?? 'MONEY_MARKET')
  const [moneda, setMoneda] = useState<Moneda>(inversion ? monedaDe(inversion) : 'ARS')
  const [invertido, setInvertido] = useState(
    inversion ? String(Number(inversion.amount_invested)) : ''
  )
  const [valorActual, setValorActual] = useState(
    inversion ? String(Number(inversion.current_value)) : ''
  )
  const [tna, setTna] = useState(inversion ? String(Number(inversion.expected_tna)) : '')
  const [liquidez, setLiquidez] = useState<PlazoDeLiquidez>(inversion?.liquidity_term ?? 'T0')
  const [entidad, setEntidad] = useState(inversion?.broker_entity ?? '')

  /**
   * Elegir un tipo arrastra su plazo habitual, salvo que estemos EDITANDO.
   *
   * En una edición el usuario ya definió el plazo alguna vez; pisarlo porque
   * tocó el tipo sería descartar una decisión suya sin avisar.
   */
  function elegirTipo(nuevo: TipoDeActivo) {
    setTipo(nuevo)
    if (!editando) {
      const sugerido = TIPOS.find((t) => t.tipo === nuevo)?.plazo
      if (sugerido) setLiquidez(sugerido)
    }
  }

  // La proyección se recalcula en vivo sobre el VALOR ACTUAL si está cargado, y
  // sobre lo invertido si no: es la plata que efectivamente está rindiendo.
  const baseDeRendimiento = aNumero(valorActual) ?? aNumero(invertido) ?? 0
  const rendimientoMensual = rendimientoMensualDe(baseDeRendimiento, aNumero(tna) ?? 0)

  // Escape cierra: es lo que espera cualquiera frente a un diálogo.
  useEffect(() => {
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alTeclear)
    // Sin esto la página de atrás sigue scrolleando debajo del modal.
    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = overflowPrevio
    }
  }, [onCerrar])

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()

    const montoInvertido = aNumero(invertido)
    if (montoInvertido === null || montoInvertido < 0) {
      setError(t('inv.errorInvertido'))
      return
    }

    const tasa = aNumero(tna) ?? 0
    if (tasa < 0) {
      setError(t('inv.errorTna'))
      return
    }

    const entrada: InversionAGuardar = {
      ...(inversion ? { id: inversion.id } : {}),
      name: nombre,
      asset_type: tipo,
      currency: moneda,
      amount_invested: montoInvertido,
      // Vacío = todavía vale lo que costó.
      current_value: aNumero(valorActual),
      expected_tna: tasa,
      liquidity_term: liquidez,
      broker_entity: entidad.trim() || null,
    }

    iniciar(async () => {
      const resultado = await guardarInversion(entrada)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setError(null)
      onCerrar()
      router.refresh()
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editando ? t('inv.editarTitulo') : t('inv.nueva')}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      {/* Fondo: cierra al tocar afuera. */}
      <button
        type="button"
        aria-label={t('comun.cerrar')}
        onClick={onCerrar}
        className="absolute inset-0 bg-midnight-navy/70 backdrop-blur-sm"
      />

      <form
        onSubmit={enviar}
        className="glass-card relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-3xl bg-menu px-5 pt-5 respiro-hoja sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="aurem-caps text-[11px] text-gold-leaf">
            {editando ? t('inv.editarTitulo') : t('inv.nueva')}
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={t('comun.cerrar')}
            className="grid size-7 place-items-center rounded-md text-subtle hover:bg-foreground/5"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={`col-span-2 ${ETIQUETA}`}>
            {t('comun.nombre')}
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              maxLength={80}
              autoFocus
              placeholder={t('inv.placeholderNombre')}
              className={CAMPO}
            />
          </label>

          {/* --- Tipo de activo, con lo que significa cada uno ------------- */}
          <fieldset className="col-span-2 flex flex-col gap-1.5">
            <legend className="pb-1 text-xs font-medium text-muted">{t('inv.elegiTipo')}</legend>

            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {TIPOS.map(({ tipo: activo }) => {
                const elegido = tipo === activo

                return (
                  <button
                    key={activo}
                    type="button"
                    onClick={() => elegirTipo(activo)}
                    aria-pressed={elegido}
                    className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2 text-left transition active:scale-[0.98] ${
                      elegido
                        ? 'border-gold-leaf bg-gold-leaf/10'
                        : 'border-glass-stroke/50 hover:border-gold-leaf/60'
                    }`}
                  >
                    <span
                      className={`text-xs font-semibold ${
                        elegido ? 'text-gold-leaf' : 'text-on-background'
                      }`}
                    >
                      {t(`inv.badge.${activo}`)}
                    </span>
                    <span className="text-[10px] leading-snug text-subtle">
                      {t(`inv.badgeDetalle.${activo}`)}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label className={ETIQUETA}>
            {t('comun.moneda')}
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as Moneda)}
              className={CAMPO}
            >
              <CurrencyOptions actual={moneda} />
            </select>
          </label>

          <label className={ETIQUETA}>
            {t('inv.montoInvertido')}
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={invertido}
              onChange={(e) => setInvertido(e.target.value)}
              required
              placeholder="0"
              className={`${CAMPO} tabular-nums`}
            />
          </label>

          <label className={ETIQUETA}>
            {t('inv.valorActual')}
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={valorActual}
              onChange={(e) => setValorActual(e.target.value)}
              placeholder={t('inv.igualAlInvertido')}
              className={`${CAMPO} tabular-nums`}
            />
          </label>

          <label className={ETIQUETA}>
            {t('inv.tna')}
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="999.99"
              step="0.01"
              value={tna}
              onChange={(e) => setTna(e.target.value)}
              placeholder="40"
              className={`${CAMPO} tabular-nums`}
            />
          </label>

          <label className={ETIQUETA}>
            {t('inv.liquidez')}
            <select
              value={liquidez}
              onChange={(e) => setLiquidez(e.target.value as PlazoDeLiquidez)}
              className={CAMPO}
            >
              {PLAZOS.map((plazo) => (
                <option key={plazo} value={plazo}>
                  {t(`liquidez.${plazo}`)}
                </option>
              ))}
            </select>
            {!editando && (
              <span className="text-[10px] font-normal leading-snug text-subtle">
                {t('inv.plazoSugerido')}
              </span>
            )}
          </label>

          <label className={`col-span-2 ${ETIQUETA}`}>
            {t('inv.entidad')}
            <input
              value={entidad}
              onChange={(e) => setEntidad(e.target.value)}
              maxLength={100}
              placeholder={t('inv.placeholderEntidad')}
              className={CAMPO}
            />
          </label>

          {/* --- Calculadora en vivo --------------------------------------
              Aparece recién cuando hay con qué calcular. Un box que dice $0
              antes de que el usuario escriba nada es ruido, y peor: parece un
              resultado. */}
          {rendimientoMensual > 0 && (
            <div className="col-span-2 flex items-baseline justify-between gap-3 rounded-xl border border-gold-leaf/30 bg-gold-leaf/[0.07] px-3 py-2.5">
              <div className="flex min-w-0 flex-col">
                <span className="aurem-caps text-[9px] text-gold-leaf/80">
                  {t('inv.rendimientoProyectado')}
                </span>
                <span className="text-[10px] text-subtle">{t('inv.rendimientoFormula')}</span>
              </div>
              <span className="shrink-0 font-display text-lg font-bold tabular-nums tracking-tight text-gold-leaf">
                {formatearMonto(rendimientoMensual, moneda)}
              </span>
            </div>
          )}

          <p className="col-span-2 text-[10px] leading-snug text-subtle">
            {t('inv.ayudaLiquidez')}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-xs text-expense">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={guardando || !nombre.trim() || invertido.trim() === ''}
          className="btn-gold flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider disabled:opacity-50"
        >
          {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {editando ? t('mov.guardarCambios') : t('comun.guardar')}
        </button>
      </form>
    </div>
  )
}

function FilaInversion({
  inversion,
  onEditar,
}: {
  inversion: Inversion
  onEditar: () => void
}) {
  const { formatearMonto } = useFormatoRegional()
  const { t } = useTraduccion()
  const router = useRouter()
  const [enCurso, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const moneda = monedaDe(inversion)
  const costo = Number(inversion.amount_invested)
  const valor = Number(inversion.current_value)
  const resultado = valor - costo
  const tna = Number(inversion.expected_tna)
  const inmovilizada = inversion.liquidity_term === 'LOCKED'

  function eliminar() {
    iniciar(async () => {
      const respuesta = await borrarInversion(inversion.id)
      if (!respuesta.ok) {
        setError(respuesta.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <li className="flex flex-col gap-1.5 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full ${
            inmovilizada ? 'bg-foreground/5 text-subtle' : 'bg-gold-leaf/10 text-gold-leaf'
          }`}
        >
          {inmovilizada ? (
            <Lock className="size-4" aria-hidden />
          ) : (
            <Zap className="size-4" aria-hidden />
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium tracking-tight">{inversion.name}</span>
          <span className="truncate text-xs text-subtle">
            {/* La entidad va PRIMERA cuando está: dos money market con la misma
                TNA sólo se distinguen por dónde están. */}
            {inversion.broker_entity ? `${inversion.broker_entity} · ` : ''}
            {t(`tipoActivo.${inversion.asset_type}`)} · {t(`liquidez.${inversion.liquidity_term}`)}
            {tna > 0 && ` · ${t('inv.tnaSufijo', { tna })}`}
          </span>
        </div>

        <div className="flex shrink-0 flex-col items-end">
          <span className="text-sm font-semibold tabular-nums tracking-tight text-on-background">
            {formatearMonto(valor, moneda)}
          </span>
          {resultado !== 0 && (
            <span
              className={`text-[10px] tabular-nums ${
                resultado > 0 ? 'text-income' : 'text-expense'
              }`}
            >
              {resultado > 0 ? '+' : '−'}
              {formatearMonto(Math.abs(resultado), moneda)}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onEditar}
            aria-label={t('mov.editarNombre', { nombre: inversion.name })}
            className="grid size-7 place-items-center rounded-md text-subtle transition hover:bg-foreground/5 hover:text-gold-leaf"
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={eliminar}
            disabled={enCurso}
            aria-label={t('comun.borrarNombre', { nombre: inversion.name })}
            className="grid size-7 place-items-center rounded-md text-subtle transition hover:bg-expense/10 hover:text-expense disabled:opacity-50"
          >
            {enCurso ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-3.5" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[11px] text-expense">
          {error}
        </p>
      )}
    </li>
  )
}

/** Listado de activos con el alta y la edición. Las métricas van en la página. */
export function InvestmentManager({ inversiones }: { inversiones: Inversion[] }) {
  const { monedasSeleccionadas } = useModoMoneda()
  const { t } = useTraduccion()

  /** null = cerrado · 'nueva' = alta · Inversion = edición de esa fila. */
  const [formulario, setFormulario] = useState<'nueva' | Inversion | null>(null)
  const cerrar = useCallback(() => setFormulario(null), [])

  // Las divisas del perfil, más cualquiera que ya tenga activos cargados.
  const monedas = [
    ...new Set([...monedasSeleccionadas, ...inversiones.map(monedaDe)]),
  ]

  const porMoneda = monedas.map((moneda) => ({
    moneda,
    activos: inversiones.filter((i) => monedaDe(i) === moneda),
  }))

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setFormulario('nueva')}
        className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-3 text-sm font-medium text-muted transition hover:border-primary/50 hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden />
        {t('inv.registrar')}
      </button>

      {porMoneda.map(({ moneda, activos }) =>
        activos.length === 0 ? null : (
          <section key={moneda} className="flex flex-col gap-2">
            <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
              {t('inv.activosEn', { moneda })}
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {activos.map((inversion) => (
                <FilaInversion
                  key={inversion.id}
                  inversion={inversion}
                  onEditar={() => setFormulario(inversion)}
                />
              ))}
            </ul>
          </section>
        )
      )}

      {inversiones.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-subtle">
          {t('inv.sinActivos')}
          <br />
          {t('inv.sinActivosPista')}
        </p>
      )}

      {formulario && (
        <FormularioDeInversion
          // Remonta el formulario al cambiar de fila: los useState de los
          // campos solo leen su valor inicial una vez.
          key={formulario === 'nueva' ? 'nueva' : formulario.id}
          inversion={formulario === 'nueva' ? undefined : formulario}
          onCerrar={cerrar}
        />
      )}
    </div>
  )
}
