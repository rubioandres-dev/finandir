'use client'

import { useMemo, useState } from 'react'
import { CalendarClock, CreditCard, Info, Sparkles, TrendingUp, Wallet } from 'lucide-react'
import { Card, CardLabel } from '@/components/ui/card'
import { getBestCardToPay } from '@/lib/card-optimizer'
import { evaluateExpenseStrategy } from '@/lib/smart-spend-service'
import { formatearMonto, hoyEnArgentina, type Moneda, type Tarjeta } from '@/lib/types'

const CUOTAS_COMUNES = [1, 3, 6, 9, 12, 18, 24]

const CAMPO =
  'rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary'
const ETIQUETA = 'flex flex-col gap-1 text-xs font-medium text-muted'

type Props = {
  tarjetas: Tarjeta[]
  /** Deuda actual por tarjeta, para descartar las que no tienen cupo. */
  deudaPorTarjeta: Record<string, number>
  /** TNA líquida ponderada del usuario por moneda; null = no tiene cartera. */
  tnaLiquida: Record<Moneda, number | null>
  /** Precio con el que llega el Smart Input, si vino desde un borrador. */
  precioInicial?: number | null
  monedaInicial?: Moneda
}

function aNumero(valor: string): number {
  return Number(valor.trim().replace(',', '.'))
}

/**
 * Calculadora de "contado con descuento vs. cuotas".
 *
 * Corre entera en el cliente: el criterio vive en `smart-spend-service` y el
 * contexto (tasa y tarjetas) llega ya resuelto desde el servidor. Así cada
 * tecla recalcula sin ida y vuelta, y el dictamen sigue siendo el mismo que se
 * puede verificar sin UI.
 */
export function SmartSpendCalculator({
  tarjetas,
  deudaPorTarjeta,
  tnaLiquida,
  precioInicial = null,
  monedaInicial = 'ARS',
}: Props) {
  const [precio, setPrecio] = useState(precioInicial != null ? String(precioInicial) : '')
  const [descuento, setDescuento] = useState('')
  const [cuotas, setCuotas] = useState(6)
  const [valorCuota, setValorCuota] = useState('')
  const [moneda, setMoneda] = useState<Moneda>(monedaInicial)
  const [fecha, setFecha] = useState(hoyEnArgentina())

  const precioNumero = aNumero(precio)

  const dictamen = useMemo(() => {
    if (!Number.isFinite(precioNumero) || precioNumero <= 0) return null

    // Vaciar el campo de fecha deja "" y con eso getBestCardToPay produce
    // NaN en todos los plazos: se cae a hoy, igual que el servicio.
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyEnArgentina()

    // La tarjeta se elige con el monto real de la compra: el cupo importa.
    const tarjeta = getBestCardToPay(
      tarjetas,
      precioNumero,
      moneda,
      new Map(Object.entries(deudaPorTarjeta)),
      new Date(`${dia}T00:00:00Z`)
    )

    return evaluateExpenseStrategy(
      {
        cashPrice: precioNumero,
        cashDiscount: aNumero(descuento) || 0,
        installments: cuotas,
        installmentAmount: aNumero(valorCuota) || null,
        purchaseDate: dia,
      },
      { tnaLiquida: tnaLiquida[moneda] ?? undefined, tarjeta, moneda }
    )
  }, [precioNumero, descuento, cuotas, valorCuota, moneda, fecha, tarjetas, deudaPorTarjeta, tnaLiquida])

  const ganaCuotas = dictamen?.ganador === 'CUOTAS'

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {/* --- Izquierda: parámetros del gasto ------------------------------- */}
      <Card className="flex flex-col gap-3 p-4">
        <CardLabel>
          <Wallet className="size-3.5 text-gold-leaf" aria-hidden />
          La compra
        </CardLabel>

        <div className="grid grid-cols-2 gap-3">
          <label className={ETIQUETA}>
            Precio contado
            <div className="flex overflow-hidden rounded-lg border border-border bg-card focus-within:border-primary">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="0"
                autoFocus
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm tabular-nums text-foreground outline-none"
              />
              <select
                value={moneda}
                onChange={(e) => setMoneda(e.target.value as Moneda)}
                aria-label="Moneda de la compra"
                className="border-l border-border bg-foreground/[0.03] px-2 text-xs font-medium text-foreground outline-none"
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </label>

          <label className={ETIQUETA}>
            Descuento contado (%)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.5"
              value={descuento}
              onChange={(e) => setDescuento(e.target.value)}
              placeholder="0"
              className={`${CAMPO} tabular-nums`}
            />
          </label>

          <label className={ETIQUETA}>
            Cuotas
            <select
              value={cuotas}
              onChange={(e) => setCuotas(Number(e.target.value))}
              className={`${CAMPO} tabular-nums`}
            >
              {CUOTAS_COMUNES.map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? 'Un pago' : `${n} cuotas`}
                </option>
              ))}
            </select>
          </label>

          <label className={ETIQUETA}>
            Valor de cada cuota
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={valorCuota}
              onChange={(e) => setValorCuota(e.target.value)}
              placeholder="Sin interés"
              className={`${CAMPO} tabular-nums`}
            />
          </label>

          <label className={`col-span-2 ${ETIQUETA}`}>
            Fecha de la compra
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={CAMPO}
            />
            <span className="text-[10px] font-normal leading-snug text-subtle">
              Define en qué resumen cae y cuántos días de float ganás.
            </span>
          </label>
        </div>

        <p className="flex items-start gap-2 rounded-lg border border-glass-stroke/50 bg-gold-leaf/[0.05] px-3 py-2 text-[11px] leading-snug text-on-surface-variant">
          <Info className="mt-px size-3.5 shrink-0 text-gold-leaf" aria-hidden />
          Dejá el valor de cuota vacío si el plan es sin interés: se toma el precio dividido por la
          cantidad de cuotas.
        </p>
      </Card>

      {/* --- Derecha: dictamen --------------------------------------------- */}
      {!dictamen ? (
        <Card className="flex min-h-56 flex-col items-center justify-center gap-2 border-dashed p-6 text-center">
          <Sparkles className="size-5 text-on-surface-variant/50" aria-hidden />
          <p className="text-sm text-subtle">
            Poné el precio de la compra y te digo cómo conviene pagarla.
          </p>
        </Card>
      ) : (
        <Card glass className="glow-gold flex flex-col gap-4 p-5">
          <CardLabel className="text-gold-leaf">
            <Sparkles className="size-3.5" aria-hidden />
            Dictamen inteligente
          </CardLabel>

          {/* La opción ganadora, en dorado y sin competencia visual. */}
          <div>
            <p className="font-display text-[1.75rem] font-bold leading-tight tracking-tighter text-gold-leaf">
              {ganaCuotas ? `Pagá en ${cuotas === 1 ? '1 pago' : `${cuotas} cuotas`}` : 'Pagá contado'}
            </p>
            <p className="mt-1.5 text-xs leading-snug text-on-surface-variant">
              {dictamen.sugerencia}
            </p>
          </div>

          <div className="fire-gradient h-px w-full opacity-40" aria-hidden />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="aurem-caps text-[9px] text-on-surface-variant/70">Ganancia estimada</p>
              <p className="mt-0.5 font-display text-xl font-bold tabular-nums text-income">
                {formatearMonto(dictamen.ganancia, dictamen.moneda)}
              </p>
              <p className="text-[10px] tabular-nums text-subtle">
                {dictamen.gananciaPorcentual}% del precio
              </p>
            </div>

            <div>
              <p className="aurem-caps text-[9px] text-on-surface-variant/70">Días de float</p>
              <p className="mt-0.5 font-display text-xl font-bold tabular-nums text-gold-leaf">
                {dictamen.diasDeFloat}
              </p>
              <p className="text-[10px] text-subtle">
                {dictamen.diasDelPlan > dictamen.diasDeFloat
                  ? `plan de ${dictamen.diasDelPlan} días`
                  : 'hasta el vencimiento'}
              </p>
            </div>
          </div>

          {/* Comparación de las dos opciones en plata de hoy. */}
          <div className="grid grid-cols-2 gap-2">
            <div
              className={`rounded-lg border px-3 py-2 ${
                ganaCuotas
                  ? 'border-glass-stroke/40 bg-surface-container/50'
                  : 'border-gold-leaf/40 bg-gold-leaf/10'
              }`}
            >
              <p className="aurem-caps text-[8px] text-on-surface-variant/70">Contado hoy</p>
              <p
                className={`mt-0.5 text-sm font-semibold tabular-nums ${
                  ganaCuotas ? 'text-on-surface-variant' : 'text-gold-leaf'
                }`}
              >
                {formatearMonto(dictamen.vpContado, dictamen.moneda)}
              </p>
            </div>

            <div
              className={`rounded-lg border px-3 py-2 ${
                ganaCuotas
                  ? 'border-gold-leaf/40 bg-gold-leaf/10'
                  : 'border-glass-stroke/40 bg-surface-container/50'
              }`}
            >
              <p className="aurem-caps text-[8px] text-on-surface-variant/70">Cuotas a valor hoy</p>
              <p
                className={`mt-0.5 text-sm font-semibold tabular-nums ${
                  ganaCuotas ? 'text-gold-leaf' : 'text-on-surface-variant'
                }`}
              >
                {formatearMonto(dictamen.vpCuotas, dictamen.moneda)}
              </p>
              <p className="text-[10px] tabular-nums text-subtle">
                nominal {formatearMonto(dictamen.totalEnCuotas, dictamen.moneda)}
              </p>
            </div>
          </div>

          {dictamen.tarjeta && (
            <div className="flex items-center gap-2.5 rounded-lg border border-glass-stroke/50 bg-surface-container/40 px-3 py-2.5">
              <CreditCard className="size-4 shrink-0 text-gold-leaf" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-on-background">
                  {dictamen.tarjeta.tarjeta.name}
                  {dictamen.tarjeta.tarjeta.detalle.last_four_digits && (
                    <span className="ml-1.5 font-mono text-[10px] tracking-widest text-subtle">
                      ···· {dictamen.tarjeta.tarjeta.detalle.last_four_digits}
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-subtle">
                  {dictamen.tarjeta.motivo} · primera cuota el{' '}
                  {dictamen.cronograma[0]?.fecha ?? dictamen.tarjeta.fechaDeVencimiento}
                </p>
              </div>
            </div>
          )}

          {/* La tasa es el supuesto que más mueve el resultado: se muestra. */}
          <div className="flex flex-col gap-1.5 border-t border-glass-stroke/40 pt-3">
            <p className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
              <TrendingUp className="size-3 shrink-0 text-gold-leaf" aria-hidden />
              Descontado al{' '}
              <strong className="font-semibold tabular-nums text-on-background">
                {dictamen.tnaAplicada}% TNA
              </strong>
              {dictamen.tnaEsPorDefecto ? ' (estimada)' : ' (tu cartera líquida)'}
            </p>

            {dictamen.tasaDeIndiferencia !== null && dictamen.tasaDeIndiferencia > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                <CalendarClock className="size-3 shrink-0 text-gold-leaf" aria-hidden />
                Empatan al{' '}
                <strong className="font-semibold tabular-nums text-on-background">
                  {dictamen.tasaDeIndiferencia}% TNA
                </strong>
                : por encima conviene financiar.
              </p>
            )}

            {dictamen.tnaEsPorDefecto && (
              <p className="text-[10px] leading-snug text-subtle">
                No tenés inversiones líquidas cargadas, así que se asume una tasa de money market.
                Cargá tu cartera para que el dictamen use tu tasa real.
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
