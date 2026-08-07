'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Check, HandCoins, Loader2, Receipt, UserPlus, Users, X } from 'lucide-react'
import { registrarSalida } from '@/app/dashboard/shared-expenses/actions'
import { useFormatoRegional, useModoMoneda, useTraduccion } from '@/components/currency-provider'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { dividirEnPartesIguales } from '@/lib/shared-expenses-service'
import { hoyEnArgentina, type CuentaElegible } from '@/lib/types'

const CAMPO =
  'rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-3 py-2 text-sm outline-none transition focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60'

type Props = {
  /** Categorías de gasto del usuario, para imputar SU cuota parte. */
  categorias: { nombre: string }[]
  /** Cuentas y tarjetas de la moneda activa. Vacío = la cuenta por defecto. */
  cuentas: CuentaElegible[]
}

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
 *
 * LOS NOMBRES SON OPCIONALES A PROPÓSITO
 *
 * Pedirlos siempre convertiría una cuenta de diez segundos en un formulario. La
 * mayoría de las veces alcanza con saber CUÁNTO te deben; sólo cuando cobrás de
 * a uno importa QUIÉN. El toggle deja elegir: sin nombres sale una sola cuenta
 * por cobrar por el acumulado, con nombres sale una por persona.
 */
export function NightOutCalculator({ categorias, cuentas }: Props) {
  const router = useRouter()
  const { t } = useTraduccion()
  const { modo } = useModoMoneda()
  const { formatearMonto } = useFormatoRegional()

  const [total, setTotal] = useState('')
  const [personas, setPersonas] = useState('2')
  const [propina, setPropina] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoria, setCategoria] = useState(categorias[0]?.nombre ?? '')
  const [cuentaId, setCuentaId] = useState('')
  const [conNombres, setConNombres] = useState(false)
  /**
   * Se guarda más largo de lo que se muestra: bajar de 4 personas a 2 y volver a
   * 4 no debería borrar lo que el usuario ya había tipeado.
   */
  const [nombres, setNombres] = useState<string[]>([])
  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enVuelo, iniciar] = useTransition()

  const totalNumero = Number(total.replace(',', '.')) || 0
  // Mínimo 2: una "salida compartida" de una persona no se comparte con nadie.
  const cantidad = Math.min(100, Math.max(2, Math.round(Number(personas) || 2)))
  const propinaNumero = Math.max(0, Number(propina.replace(',', '.')) || 0)
  const otros = cantidad - 1

  const conPropina = Math.round(totalNumero * (1 + propinaNumero / 100) * 100) / 100

  // El MISMO reparto que hace el servidor, para que la previsualización no
  // prometa un número y se guarde otro.
  const partes = useMemo(() => dividirEnPartesIguales(conPropina, cantidad), [conPropina, cantidad])
  const miParte = partes[0] ?? 0
  const partesDeLosDemas = partes.slice(1)
  const porCobrar = Math.round((conPropina - miParte) * 100) / 100

  const hayCuenta = totalNumero > 0
  const visibles = nombres.slice(0, otros)
  const faltanNombres = conNombres && visibles.filter((n) => n.trim()).length < otros

  function escribirNombre(indice: number, valor: string) {
    setNombres((previos) => {
      const copia = [...previos]
      while (copia.length <= indice) copia.push('')
      copia[indice] = valor
      return copia
    })
  }

  function registrar(modoRegistro: 'TOTAL' | 'SOLO_MI_PARTE') {
    setError(null)

    if (!categoria) {
      setError(t('calculadora.faltaCategoria'))
      return
    }

    // Los nombres sólo se exigen si el usuario abrió la lista, y sólo para la
    // opción A: en "solo mi parte" no hay ninguna deuda que atribuir.
    if (modoRegistro === 'TOTAL' && faltanNombres) {
      setError(t('calculadora.faltanNombres'))
      return
    }

    iniciar(async () => {
      const resultado = await registrarSalida({
        total: conPropina,
        personas: cantidad,
        descripcion: descripcion.trim() || t('calculadora.descripcionPorDefecto'),
        categoria,
        moneda: modo,
        fecha: hoyEnArgentina(),
        cuentaId: cuentaId || null,
        nombres:
          modoRegistro === 'TOTAL' && conNombres
            ? visibles.map((n) => n.trim()).filter(Boolean)
            : [],
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
                step="0.01"
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
                min="2"
                max="100"
                value={personas}
                onChange={(e) => setPersonas(e.target.value)}
                disabled={enVuelo}
                className={`${CAMPO} tabular-nums`}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              {t('calculadora.propinaOpcional')}
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                value={propina}
                onChange={(e) => setPropina(e.target.value)}
                placeholder="0"
                disabled={enVuelo}
                className={`${CAMPO} tabular-nums`}
              />
            </label>
          </div>

          {/* --- Nombres, opcionales ----------------------------------------- */}
          {!conNombres ? (
            <button
              type="button"
              onClick={() => setConNombres(true)}
              disabled={enVuelo}
              className="flex cursor-pointer items-center gap-1.5 self-start rounded-lg border border-dashed border-glass-stroke/60 px-3 py-2 text-xs font-medium text-on-surface-variant transition hover:border-gold-leaf/60 hover:text-gold-leaf disabled:opacity-60"
            >
              <UserPlus className="size-3.5 shrink-0" aria-hidden />
              {t('calculadora.agregarNombres')}
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-glass-stroke/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
                  <Users className="size-3.5 shrink-0 text-gold-leaf" aria-hidden />
                  {t('calculadora.participantes')}
                </span>
                <button
                  type="button"
                  onClick={() => setConNombres(false)}
                  disabled={enVuelo}
                  aria-label={t('calculadora.quitarNombres')}
                  className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-subtle transition hover:text-expense disabled:opacity-60"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>

              <p className="text-[11px] leading-snug text-subtle">
                {t('calculadora.nombresAyuda', { cantidad: String(otros) })}
              </p>

              {Array.from({ length: otros }, (_, indice) => (
                <input
                  key={indice}
                  type="text"
                  value={nombres[indice] ?? ''}
                  onChange={(e) => escribirNombre(indice, e.target.value)}
                  maxLength={80}
                  placeholder={t('calculadora.nombrePlaceholder', { numero: String(indice + 1) })}
                  disabled={enVuelo}
                  className={CAMPO}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Resultado ------------------------------------------------------ */}
      {hayCuenta && (
        <Card glass className="glow-gold flex flex-col gap-2 p-5">
          <CardLabel className="text-gold-leaf">{t('calculadora.porPersona')}</CardLabel>
          <p className="font-display text-[2rem] font-bold leading-tight tracking-tighter tabular-nums text-gold-leaf">
            {formatearMonto(miParte, modo)}
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

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                {t('calculadora.categoria')}
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  disabled={enVuelo}
                  className={CAMPO}
                >
                  {categorias.length === 0 && <option value="">—</option>}
                  {categorias.map((c) => (
                    <option key={c.nombre} value={c.nombre}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                {t('calculadora.pagadoCon')}
                <select
                  value={cuentaId}
                  onChange={(e) => setCuentaId(e.target.value)}
                  disabled={enVuelo}
                  className={CAMPO}
                >
                  <option value="">{t('comun.cuentaPorDefecto')}</option>
                  {cuentas.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>
                      {cuenta.type === 'CREDIT_CARD' ? `💳 ${cuenta.name}` : cuenta.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

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

              {/* Los tres asientos, en el mismo orden en que se explican. Que el
                  usuario vea el desglose ANTES de confirmar es la mitad del
                  valor de la pantalla. */}
              <span className="flex flex-col gap-0.5 text-[11px] tabular-nums text-on-surface-variant">
                <span>
                  {t('calculadora.salidaBancaria')}: −{formatearMonto(conPropina, modo)}
                </span>
                <span>
                  {t('calculadora.gastoImputado')}: {formatearMonto(miParte, modo)}
                  {categoria && ` · ${categoria}`}
                </span>
                <span>
                  {t('calculadora.montoACobrar')}: {formatearMonto(porCobrar, modo)}
                  {conNombres && !faltanNombres
                    ? ` · ${t('calculadora.enRegistros', { cantidad: String(otros) })}`
                    : ` · ${t('calculadora.registroUnico')}`}
                </span>
              </span>

              {/* Con nombres, quién debe cuánto. Con el reparto exacto: si el
                  total no divide justo, alguien paga un centavo distinto. */}
              {conNombres && !faltanNombres && (
                <span className="flex flex-col gap-0.5 border-t border-glass-stroke/30 pt-1.5 text-[11px] tabular-nums text-subtle">
                  {visibles.map((nombre, indice) => (
                    <span key={indice}>
                      {nombre.trim()}: {formatearMonto(partesDeLosDemas[indice] ?? 0, modo)}
                    </span>
                  ))}
                </span>
              )}
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
                −{formatearMonto(miParte, modo)}
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
