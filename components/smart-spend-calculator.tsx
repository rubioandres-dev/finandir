'use client'

import { useMemo, useState } from 'react'
import { CalendarClock, CreditCard, Info, PiggyBank, Sparkles, TrendingUp, Wallet } from 'lucide-react'
import { InvestmentStrategyBreakdown } from '@/components/investment-strategy-breakdown'
import { Card, CardLabel } from '@/components/ui/card'
import { getBestCardToPay } from '@/lib/card-optimizer'
import { evaluateExpenseStrategy } from '@/lib/smart-spend-service'
import {
  formatearMonto,
  hoyEnArgentina,
  type Inversion,
  type Moneda,
  type Tarjeta,
} from '@/lib/types'

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
  /** Cartera del usuario, para mostrar con qué activos se sostiene el plan. */
  inversiones: Inversion[]
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
  inversiones,
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
  // Se acota igual que en el servicio, para no anunciar un 150% de descuento.
  const descuentoAplicado = Math.min(Math.max(aNumero(descuento) || 0, 0), 100)

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
              Define en qué resumen de la tarjeta cae y cuántos días tenés hasta pagarla.
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

          {/* El número que la pantalla existe para dar. */}
          <div className="flex items-center gap-3 rounded-xl border border-income/35 bg-income/10 px-3.5 py-3">
            <PiggyBank className="size-5 shrink-0 text-income" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-on-surface-variant">
                Ahorro real estimado
              </p>
              <p className="text-[10px] text-subtle">
                pagando {ganaCuotas ? `en ${cuotas === 1 ? '1 pago' : `${cuotas} cuotas`}` : 'de contado'}
              </p>
            </div>
            <p className="shrink-0 text-right">
              <span className="font-display text-xl font-bold leading-none tabular-nums text-income">
                {formatearMonto(dictamen.ganancia, dictamen.moneda)}
              </span>
              <span className="block text-[10px] tabular-nums text-income/80">
                {dictamen.gananciaPorcentual}% del precio
              </span>
            </p>
          </div>

          {/* Las dos opciones, cada una contada como la vive el usuario: una es
              plata que sale hoy, la otra un plan que rinde mientras se paga. */}
          <div className="flex flex-col gap-2">
            <div
              className={`rounded-xl border px-3.5 py-3 ${
                ganaCuotas
                  ? 'border-glass-stroke/40 bg-surface-container/40'
                  : 'border-gold-leaf/45 bg-gold-leaf/10'
              }`}
            >
              <p className="text-xs font-semibold tracking-tight text-on-background">
                Si pagás de contado
              </p>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <span className="text-[11px] text-on-surface-variant">Desembolso inmediato</span>
                <strong
                  className={`font-display text-base font-bold tabular-nums ${
                    ganaCuotas ? 'text-on-background' : 'text-gold-leaf'
                  }`}
                >
                  {formatearMonto(dictamen.precioContado, dictamen.moneda)}
                </strong>
              </div>
              {descuentoAplicado > 0 && (
                <p className="mt-1 text-[10px] tabular-nums text-subtle">
                  ya con el {descuentoAplicado}% de descuento
                </p>
              )}
            </div>

            <div
              className={`rounded-xl border px-3.5 py-3 ${
                ganaCuotas
                  ? 'border-gold-leaf/45 bg-gold-leaf/10'
                  : 'border-glass-stroke/40 bg-surface-container/40'
              }`}
            >
              <p className="text-xs font-semibold tracking-tight text-on-background">
                Si pagás en {cuotas === 1 ? '1 pago' : `${cuotas} cuotas`}
              </p>

              <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[11px] text-on-surface-variant">
                    Total pagado en cuotas
                  </span>
                  <span className="text-[13px] font-medium tabular-nums text-on-background">
                    {formatearMonto(dictamen.totalEnCuotas, dictamen.moneda)}
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[11px] text-on-surface-variant">
                    Intereses ganados por invertir
                  </span>
                  <span className="text-[13px] font-medium tabular-nums text-income">
                    −{formatearMonto(dictamen.interesesGanados, dictamen.moneda)}
                  </span>
                </div>

                <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-glass-stroke/40 pt-1.5">
                  <span className="text-[11px] font-medium text-on-surface-variant">
                    Costo real neto
                  </span>
                  <strong className="font-display text-base font-bold tabular-nums text-gold-leaf">
                    {formatearMonto(dictamen.vpCuotas, dictamen.moneda)}
                  </strong>
                </div>
              </div>

              <p className="mt-2 text-[10px] tabular-nums text-subtle">
                {cuotas === 1 ? 'Un pago' : `${cuotas} cuotas`} de{' '}
                {formatearMonto(dictamen.cronograma[0]?.monto ?? 0, dictamen.moneda)} · la primera
                en {dictamen.diasDeFloat} días
              </p>
            </div>
          </div>

          {/* De dónde sale la plata que hace que financiar rinda. */}
          <InvestmentStrategyBreakdown
            inversiones={inversiones}
            moneda={dictamen.moneda}
            tnaAplicada={dictamen.tnaAplicada}
          />

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
              Calculado con tu plata rindiendo al{' '}
              <strong className="font-semibold tabular-nums text-on-background">
                {dictamen.tnaAplicada}% TNA
              </strong>
              {dictamen.tnaEsPorDefecto ? ' (tasa estimada)' : ' (tu cartera)'}
            </p>

            {dictamen.tasaDeIndiferencia !== null && dictamen.tasaDeIndiferencia > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                <CalendarClock className="size-3 shrink-0 text-gold-leaf" aria-hidden />
                Si tu plata rindiera menos del{' '}
                <strong className="font-semibold tabular-nums text-on-background">
                  {dictamen.tasaDeIndiferencia}% TNA
                </strong>
                , convendría pagar de contado.
              </p>
            )}

            {/* Sin cartera cargada, la card de la bombilla de arriba ya explica
                qué hacer: acá solo se aclara de dónde sale el número. */}
            {dictamen.tnaEsPorDefecto && (
              <p className="text-[10px] leading-snug text-subtle">
                Todavía no cargaste inversiones, así que se usa una tasa de referencia. Cargá las
                tuyas y el cálculo pasa a usar tu rendimiento real.
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
