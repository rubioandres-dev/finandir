'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { CreditCard, Loader2, Mic, Sparkles, Square } from 'lucide-react'
import { guardarTransaccion } from '@/app/dashboard/actions'
import { VoiceMeter } from '@/components/voice-meter'
import { resolverPlan } from '@/lib/cuotas'
import { useVoiceInput } from '@/lib/use-voice-input'
import {
  ETIQUETA_TIPO,
  formatearMonto,
  hoyEnArgentina,
  type CuentaElegible,
  type MovimientoSugerido,
  type TipoTransaccion,
} from '@/lib/types'

const EJEMPLOS = ['Gasté 1500 en la carnicería hoy', 'Cargué 25 lucas de nafta', 'Cobré el sueldo']

const CUOTAS_COMUNES = [1, 3, 6, 9, 12, 18, 24]

type Props = {
  /** Nombres de categorías del usuario, para poblar el select de la vista previa. */
  categorias: { nombre: string; tipo: 'INCOME' | 'EXPENSE' }[]
  /** Cuentas y tarjetas disponibles como origen del movimiento. */
  cuentas?: CuentaElegible[]
}

export function SmartInput({ categorias, cuentas = [] }: Props) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [analizando, setAnalizando] = useState(false)
  const [guardando, iniciarGuardado] = useTransition()
  const [borrador, setBorrador] = useState<MovimientoSugerido | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /**
   * Espejo de `texto` para leerlo sin depender del closure: el dictado y el
   * análisis automático ocurren en callbacks asíncronos del reconocedor.
   */
  const textoRef = useRef('')
  /** Evita dos análisis simultáneos (botón + auto-disparo por voz). */
  const enVueloRef = useRef(false)
  const [analizadoPorVoz, setAnalizadoPorVoz] = useState(false)
  const [cuentaId, setCuentaId] = useState<string>('')
  const [tieneInteres, setTieneInteres] = useState(false)
  /** Base de financiación: el total, o el valor de cada cuota. */
  const [modoInteres, setModoInteres] = useState<'total' | 'cuota'>('total')
  const [montoFinanciado, setMontoFinanciado] = useState('')

  function escribir(valor: string) {
    textoRef.current = valor
    setTexto(valor)
  }

  async function analizarTexto(valor: string, desdeVoz = false) {
    const limpio = valor.trim()
    if (!limpio || enVueloRef.current) return

    enVueloRef.current = true
    setAnalizando(true)
    setAnalizadoPorVoz(desdeVoz)
    setError(null)
    setExito(null)
    setBorrador(null)

    try {
      const respuesta = await fetch('/api/ai-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: limpio,
          accounts: cuentas.map((c) => ({ name: c.name, type: c.type, currency: c.currency })),
        }),
      })
      const datos = await respuesta.json()

      if (!respuesta.ok) {
        setError(datos?.error ?? `Error ${respuesta.status}`)
        return
      }

      const sugerido = datos as MovimientoSugerido
      setBorrador(sugerido)

      // La IA devuelve el nombre; acá lo resolvemos al id real.
      const porNombre = sugerido.account_name?.trim().toLowerCase()
      const coincidencia = porNombre
        ? cuentas.find((c) => c.name.trim().toLowerCase() === porNombre)
        : undefined
      setCuentaId(coincidencia?.id ?? '')
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      enVueloRef.current = false
      setAnalizando(false)
    }
  }

  const voz = useVoiceInput({
    onResultadoFinal: (transcripcion) => {
      // Se agrega a lo que ya haya escrito, en vez de pisarlo.
      const previo = textoRef.current.trim()
      escribir(previo ? `${previo} ${transcripcion}` : transcripcion)
      setError(null)
    },
    // El motor cerró la frase al detectar la pausa: analizamos solos.
    onDictadoFinalizado: () => {
      void analizarTexto(textoRef.current, true)
    },
  })

  function analizar(event: React.FormEvent) {
    event.preventDefault()
    void analizarTexto(texto)
  }

  function confirmar() {
    if (!borrador || guardando) return

    iniciarGuardado(async () => {
      const resultado = await guardarTransaccion({
        amount: borrador.amount,
        type: borrador.type,
        currency: borrador.currency,
        category_suggested: borrador.category_suggested,
        description: borrador.description,
        date: borrador.date,
        account_id: cuentaId || null,
        // Sin tarjeta no hay plan de cuotas, aunque el borrador lo traiga.
        installment_total: cuotas,
        total_financed_amount:
          hayFinanciado && modoInteres === 'total' ? financiado : null,
        installment_amount: hayFinanciado && modoInteres === 'cuota' ? financiado : null,
      })

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      setBorrador(null)
      setCuentaId('')
      setTieneInteres(false)
      setMontoFinanciado('')
      escribir('')
      setError(null)
      setExito('Movimiento guardado.')
      // Vuelve a ejecutar el Server Component del dashboard con los datos nuevos.
      router.refresh()
    })
  }

  // Para el select: las del tipo elegido, más la sugerida si la IA inventó una.
  const categoriasDisponibles = borrador
    ? Array.from(
        new Set([
          ...categorias.filter((c) => c.tipo === borrador.type).map((c) => c.nombre),
          ...(borrador.type !== 'TRANSFER' ? [borrador.category_suggested] : []),
        ])
      ).sort((a, b) => a.localeCompare(b, 'es'))
    : []

  // Solo se ofrecen cuentas de la misma moneda: la action las rechaza si no.
  const cuentasCompatibles = borrador
    ? cuentas.filter((c) => c.currency.trim() === borrador.currency)
    : []

  const cuentaElegida = cuentasCompatibles.find((c) => c.id === cuentaId)
  const admiteCuotas = cuentaElegida?.type === 'CREDIT_CARD' && borrador?.type === 'EXPENSE'
  const cuotas = admiteCuotas ? (borrador?.installment_total ?? 1) : 1

  // El plan se resuelve con la MISMA función que usa el servidor, así la
  // vista previa y lo que se guarda no pueden divergir.
  const financiado = Number(montoFinanciado.replace(',', '.'))
  const hayFinanciado = tieneInteres && Number.isFinite(financiado) && financiado > 0

  const plan = resolverPlan({
    cuotas,
    precioContado: borrador?.amount ?? 0,
    totalFinanciado: hayFinanciado && modoInteres === 'total' ? financiado : null,
    montoDeCuota: hayFinanciado && modoInteres === 'cuota' ? financiado : null,
  })

  const montoPorCuota = plan.montos[0] ?? 0

  function actualizar<K extends keyof MovimientoSugerido>(campo: K, valor: MovimientoSugerido[K]) {
    setBorrador((previo) => (previo ? { ...previo, [campo]: valor } : previo))
  }

  return (
    <section className="flex flex-col gap-3">
      <form onSubmit={analizar} className="flex flex-col gap-2.5">
        <div className="relative">
          <Sparkles
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-gold-leaf"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={voz.escuchando && voz.parcial ? `${texto} ${voz.parcial}`.trim() : texto}
            onChange={(e) => escribir(e.target.value)}
            placeholder={voz.escuchando ? 'Te escucho…' : 'Gasté $1500 en la carnicería hoy'}
            maxLength={500}
            autoComplete="off"
            enterKeyHint="send"
            disabled={analizando || guardando}
            aria-label="Describí el movimiento en lenguaje natural"
            className={`w-full rounded-2xl border bg-charcoal py-3.5 pl-10 text-base tracking-tight outline-none transition placeholder:text-subtle disabled:opacity-60 ${
              voz.soportado ? 'pr-12' : 'pr-3.5'
            } ${
              voz.escuchando
                ? 'border-error-rose ring-2 ring-error-rose/25'
                : 'border-glass-stroke/60 focus:border-gold-leaf focus:ring-1 focus:ring-gold-leaf/40'
            }`}
          />

          {voz.soportado && (
            <button
              type="button"
              onClick={voz.alternar}
              disabled={analizando || guardando}
              aria-label={
                voz.escuchando
                  ? 'Detener dictado sin analizar'
                  : 'Dictar por voz: al hacer una pausa se analiza solo'
              }
              title={
                voz.escuchando
                  ? 'Detener sin analizar'
                  : 'Dictar por voz — al pausar se analiza automáticamente'
              }
              aria-pressed={voz.escuchando}
              className={`absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg transition disabled:opacity-40 ${
                voz.escuchando
                  ? 'bg-expense text-white'
                  : 'text-subtle hover:bg-foreground/5 hover:text-foreground'
              }`}
            >
              {voz.escuchando ? (
                <>
                  {/* Halo pulsante detrás del botón mientras graba. */}
                  <span className="absolute inset-0 animate-ping rounded-lg bg-expense/40" aria-hidden />
                  <Square className="relative size-3.5 fill-current" aria-hidden />
                </>
              ) : (
                <Mic className="size-[18px]" aria-hidden />
              )}
            </button>
          )}
        </div>

        {voz.soportado && (
          <VoiceMeter
            estado={voz.estado}
            nivel={voz.nivel}
            sinSenal={voz.sinSenal}
            permiso={voz.permiso}
            picoDePrueba={voz.picoDePrueba}
          />
        )}

        {voz.error && (
          <p role="alert" className="text-xs text-budget-warn">
            {voz.error}
          </p>
        )}

        <button
          type="submit"
          disabled={analizando || guardando || !texto.trim()}
          className="btn-gold flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-display text-sm font-bold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-45"
        >
          {analizando && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {analizando ? 'Interpretando…' : 'Analizar con IA'}
        </button>
      </form>

      {!borrador && !analizando && (
        <div className="flex flex-wrap gap-1.5">
          {EJEMPLOS.map((ejemplo) => (
            <button
              key={ejemplo}
              type="button"
              onClick={() => escribir(ejemplo)}
              className="rounded-full border border-glass-stroke/50 px-2.5 py-1 text-xs text-on-surface-variant/75 transition hover:border-gold-leaf/60 hover:text-gold-leaf"
            >
              {ejemplo}
            </button>
          ))}
        </div>
      )}

      {analizando && (
        <div
          role="status"
          className="flex animate-pulse items-center gap-2 rounded-xl border border-glass-stroke/40 bg-gold-leaf/[0.04] px-4 py-3 text-sm text-on-surface-variant/70"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {analizadoPorVoz
            ? 'Terminaste de hablar: interpretando lo que dictaste…'
            : 'Gemini está interpretando tu movimiento…'}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
        >
          {error}
        </p>
      )}

      {exito && !borrador && (
        <p
          role="status"
          className="rounded-2xl border border-income/30 bg-income/10 px-3.5 py-2.5 text-sm text-income"
        >
          {exito}
        </p>
      )}

      {borrador && (
        <div className="glass-card flex flex-col gap-4 rounded-2xl p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="aurem-caps text-[10px] text-gold-leaf">Revisá antes de guardar</h2>
            <span
              className={`font-display text-lg font-bold tabular-nums ${
                borrador.type === 'INCOME' ? 'text-success-emerald' : 'text-on-background'
              }`}
            >
              {borrador.type === 'INCOME' ? '+' : '−'}
              {formatearMonto(borrador.amount || 0, borrador.currency)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Importe
              <div className="flex overflow-hidden rounded-lg border border-border bg-card focus-within:border-primary">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={borrador.amount}
                  onChange={(e) => actualizar('amount', Number(e.target.value))}
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-foreground outline-none"
                />
                {/* La moneda va pegada al importe: es una propiedad del monto,
                    no un campo aparte. */}
                <select
                  value={borrador.currency}
                  onChange={(e) => actualizar('currency', e.target.value as 'ARS' | 'USD')}
                  aria-label="Moneda del movimiento"
                  className="border-l border-border bg-foreground/[0.03] px-2 text-xs font-medium tabular-nums text-foreground outline-none"
                >
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Tipo
              <select
                value={borrador.type}
                onChange={(e) => actualizar('type', e.target.value as TipoTransaccion)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              >
                {(Object.keys(ETIQUETA_TIPO) as TipoTransaccion[]).map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ETIQUETA_TIPO[tipo]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Categoría
              <select
                value={borrador.category_suggested}
                disabled={borrador.type === 'TRANSFER'}
                onChange={(e) => actualizar('category_suggested', e.target.value)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-45"
              >
                {borrador.type === 'TRANSFER' ? (
                  <option value="">Sin categoría</option>
                ) : (
                  categoriasDisponibles.map((nombre) => (
                    <option key={nombre} value={nombre}>
                      {nombre}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Fecha
              <input
                type="date"
                value={borrador.date}
                max={hoyEnArgentina()}
                onChange={(e) => actualizar('date', e.target.value)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>

            {cuentasCompatibles.length > 0 && (
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Pagado con
                <select
                  value={cuentaId}
                  onChange={(e) => setCuentaId(e.target.value)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="">Cuenta por defecto</option>
                  {cuentasCompatibles.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>
                      {cuenta.type === 'CREDIT_CARD' ? `💳 ${cuenta.name}` : cuenta.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Las cuotas solo tienen sentido en un gasto con tarjeta. */}
            {admiteCuotas && (
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Cuotas
                <select
                  value={borrador.installment_total ?? 1}
                  onChange={(e) => actualizar('installment_total', Number(e.target.value))}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums text-foreground outline-none focus:border-primary"
                >
                  {CUOTAS_COMUNES.map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? 'Un pago' : `${n} cuotas`}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {cuotas > 1 && (
              <div className="col-span-2 flex flex-col gap-2.5">
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-glass-stroke/60 px-3 py-2">
                  <span className="text-xs font-medium text-on-surface-variant">
                    ¿Tiene interés?
                  </span>
                  <input
                    type="checkbox"
                    checked={tieneInteres}
                    onChange={(e) => setTieneInteres(e.target.checked)}
                    className="size-4 accent-[var(--gold-leaf)]"
                  />
                </label>

                {tieneInteres && (
                  <div className="flex flex-col gap-2.5 rounded-lg border border-budget-warn/25 bg-budget-warn/[0.07] p-3">
                    <div
                      role="group"
                      aria-label="Cómo informás el financiamiento"
                      className="flex rounded-lg border border-glass-stroke/60 p-0.5"
                    >
                      {(['total', 'cuota'] as const).map((modo) => (
                        <button
                          key={modo}
                          type="button"
                          onClick={() => setModoInteres(modo)}
                          aria-pressed={modoInteres === modo}
                          className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
                            modoInteres === modo
                              ? 'fire-gradient text-midnight-navy'
                              : 'text-subtle hover:text-gold-leaf'
                          }`}
                        >
                          {modo === 'total' ? 'Monto financiado total' : 'Valor de cada cuota'}
                        </button>
                      ))}
                    </div>

                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={montoFinanciado}
                      onChange={(e) => setMontoFinanciado(e.target.value)}
                      placeholder={
                        modoInteres === 'total'
                          ? 'Total a pagar con recargo'
                          : 'Valor de cada cuota'
                      }
                      className="rounded-lg border border-glass-stroke/60 bg-charcoal px-3 py-2 text-sm tabular-nums text-foreground outline-none focus:border-gold-leaf"
                    />

                    {/* Comparativa contado vs financiado: es la única forma de
                        ver qué cuesta realmente pagar en cuotas. */}
                    {hayFinanciado && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-glass-stroke/40 bg-surface-container/60 px-2.5 py-2">
                          <p className="aurem-caps text-[8px] text-on-surface-variant/70">
                            Precio contado
                          </p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-on-background">
                            {formatearMonto(plan.precioContado ?? 0, borrador.currency)}
                          </p>
                        </div>
                        <div className="rounded-lg border border-budget-warn/30 bg-budget-warn/10 px-2.5 py-2">
                          <p className="aurem-caps text-[8px] text-budget-warn/80">
                            Financiado total
                          </p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-budget-warn">
                            {formatearMonto(plan.totalAPagar, borrador.currency)}
                          </p>
                        </div>
                      </div>
                    )}

                    {plan.recargo > 0 && (
                      <p className="text-[11px] tabular-nums text-budget-warn">
                        Recargo:{' '}
                        <strong className="font-semibold">
                          {formatearMonto(plan.recargo, borrador.currency)}
                        </strong>
                        {plan.recargoPorcentual !== null && ` (${plan.recargoPorcentual}%)`} sobre
                        el contado
                      </p>
                    )}
                  </div>
                )}

                <p className="flex items-center gap-2 rounded-lg border border-glass-stroke bg-gold-leaf/[0.07] px-3 py-2 text-xs text-gold-leaf">
                  <CreditCard className="size-3.5 shrink-0" aria-hidden />
                  <span className="tabular-nums">
                    {cuotas} cuotas de{' '}
                    <strong className="font-semibold">
                      {formatearMonto(montoPorCuota, borrador.currency)}
                    </strong>
                    /mes (Total Financiado:{' '}
                    {formatearMonto(plan.totalAPagar, borrador.currency)})
                  </span>
                </p>
              </div>
            )}

            <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted">
              Descripción
              <input
                type="text"
                value={borrador.description}
                maxLength={120}
                onChange={(e) => actualizar('description', e.target.value)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmar}
              disabled={guardando || !borrador.amount || !borrador.description.trim()}
              className="btn-gold flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-45"
            >
              {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {guardando ? 'Guardando…' : 'Confirmar y guardar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setBorrador(null)
                setError(null)
              }}
              disabled={guardando}
              className="rounded-lg border border-glass-stroke/50 px-4 py-2.5 text-sm font-medium text-on-surface-variant transition hover:border-gold-leaf/50 hover:text-gold-leaf disabled:opacity-45"
            >
              Descartar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
