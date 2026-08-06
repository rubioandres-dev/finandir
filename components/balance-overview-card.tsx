import { CreditCard, Droplets, Scale, TrendingUp, TriangleAlert } from 'lucide-react'
import { Card, CardLabel } from '@/components/ui/card'
import type { CapaDeBalance, ResumenDeBalance } from '@/lib/balance-overview'
import { crearFormateadores, type Locale } from '@/lib/formatters'
import { crearTraductor, type Clave, type Idioma } from '@/lib/i18n'
import type { Moneda } from '@/lib/types'

/**
 * Balance del Home en tres capas.
 *
 * POR QUÉ ES UN SERVER COMPONENT
 *
 * No tiene estado ni interacción: recibe el resumen ya calculado y lo pinta.
 * Dejarlo del lado del servidor mantiene los formateadores y el traductor fuera
 * del bundle del cliente, igual que hace la vista consolidada.
 *
 * LA JERARQUÍA ES EL MENSAJE
 *
 * El patrimonio neto va arriba y grande porque es el único número que responde
 * "cuánto tengo". Las tres columnas de abajo responden preguntas distintas
 * —"cuánto puedo gastar hoy", "cuánto debo", "cuánto está invertido"— y por eso
 * tienen el mismo peso visual entre ellas: ninguna es más importante, son tres
 * lecturas del mismo patrimonio.
 */

/** Un número de capa, o el aviso de que no se pudo unificar. */
function TotalDeCapa({
  capa,
  moneda,
  locale,
  idioma,
  className = '',
}: {
  capa: CapaDeBalance
  moneda: Moneda
  locale: Locale
  idioma: Idioma
  className?: string
}) {
  const { formatearMonto } = crearFormateadores(locale)
  const t = crearTraductor(idioma)

  if (capa.total === null) {
    return <span className="text-sm font-medium text-subtle">{t('balance.sinCotizacion')}</span>
  }

  return (
    <span className={`font-display text-lg font-bold tabular-nums tracking-tight ${className}`}>
      {formatearMonto(capa.total, moneda)}
    </span>
  )
}

/**
 * El desglose sin convertir, cuando hay más de una divisa en juego.
 *
 * Con una sola divisa sería repetir el número de arriba. Con dos o más es la
 * única forma de ver qué parte del total vino de dónde sin creerle a ciegas al
 * tipo de cambio.
 */
function PorMoneda({
  capa,
  destino,
  locale,
}: {
  capa: CapaDeBalance
  destino: Moneda
  locale: Locale
}) {
  const { formatearMonto } = crearFormateadores(locale)
  const otras = capa.porMoneda.filter((linea) => linea.moneda !== destino)

  if (capa.porMoneda.length < 2 && otras.length === 0) return null

  return (
    <ul className="flex flex-col gap-0.5">
      {capa.porMoneda.map(({ moneda, valor }) => (
        <li key={moneda} className="text-[10px] tabular-nums text-subtle">
          {formatearMonto(valor, moneda)}
        </li>
      ))}
    </ul>
  )
}

/** Una línea del desglose del neto: rótulo a la izquierda, monto a la derecha. */
function Linea({
  etiqueta,
  capa,
  moneda,
  locale,
  idioma,
  resta = false,
}: {
  etiqueta: Clave
  capa: CapaDeBalance
  moneda: Moneda
  locale: Locale
  idioma: Idioma
  resta?: boolean
}) {
  const { formatearMonto } = crearFormateadores(locale)
  const t = crearTraductor(idioma)

  // Una línea en cero no aporta: el desglose tiene que caber de un vistazo.
  if (capa.total === null || capa.total === 0) return null

  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate text-[11px] text-on-surface-variant">{t(etiqueta)}</span>
      <span
        className={`shrink-0 text-xs font-medium tabular-nums ${
          resta ? 'text-expense' : 'text-on-background'
        }`}
      >
        {resta ? '−' : ''}
        {formatearMonto(capa.total, moneda)}
      </span>
    </div>
  )
}

export function BalanceOverviewCard({
  resumen,
  locale,
  idioma,
  mostrarInversiones = true,
  mostrarDeudas = true,
}: {
  resumen: ResumenDeBalance
  locale: Locale
  idioma: Idioma
  /** Módulo `investments`: apagado, la columna no se muestra. */
  mostrarInversiones?: boolean
  /** Módulo `debts`: apagado, las líneas de deuda personal no se muestran. */
  mostrarDeudas?: boolean
}) {
  const { formatearMonto } = crearFormateadores(locale)
  const t = crearTraductor(idioma)

  const { moneda, patrimonioNeto } = resumen
  const columnas = mostrarInversiones ? 'sm:grid-cols-3' : 'sm:grid-cols-2'

  return (
    <section className="flex flex-col gap-3">
      {/* --- Capa 1 · Patrimonio neto ----------------------------------- */}
      <Card glass className="glow-gold flex flex-col gap-2 p-5">
        <CardLabel className="text-gold-leaf">
          <Scale className="size-3.5" aria-hidden />
          {t('cuentas.patrimonioNeto')} · {moneda}
        </CardLabel>

        {patrimonioNeto === null ? (
          <>
            <p className="mt-1 font-display text-2xl font-bold tracking-tighter text-subtle">
              {t('balance.sinCotizacion')}
            </p>
            <p className="text-[11px] leading-snug text-subtle">
              {t('balance.sinCotizacionDetalle', {
                monedas: resumen.sinCotizacion.join(', '),
              })}
            </p>
          </>
        ) : (
          <>
            <p
              className={`mt-1 font-display text-[2rem] font-bold leading-tight tracking-tighter tabular-nums ${
                patrimonioNeto < 0 ? 'text-expense' : 'text-gold-leaf'
              }`}
            >
              {formatearMonto(patrimonioNeto, moneda)}
            </p>

            {/* Desglose de los términos que no tienen columna propia abajo.
                Sin esto, "me deben" y las deudas personales entran al neto sin
                aparecer en ningún lado y el número no se puede reconstruir. */}
            <div className="mt-1 flex flex-col gap-1">
              <Linea
                etiqueta="consolidado.meDeben"
                capa={resumen.porCobrar}
                moneda={moneda}
                locale={locale}
                idioma={idioma}
              />
              {mostrarDeudas && (
                <Linea
                  etiqueta="consolidado.deudasPersonales"
                  capa={resumen.deudaPersonal}
                  moneda={moneda}
                  locale={locale}
                  idioma={idioma}
                  resta
                />
              )}
            </div>

            {/* Filamento dorado al pie: cierra la card sin agregar otro borde. */}
            <div className="fire-gradient mt-3 h-px w-full opacity-40" aria-hidden />

            <p className="text-[10px] leading-snug text-subtle">
              {t('cuentas.formula')}. {t('balance.expresadoEn', { moneda })}
            </p>
          </>
        )}
      </Card>

      {/* --- Capa 2 · las tres lecturas --------------------------------- */}
      <div className={`grid grid-cols-1 items-stretch gap-3 ${columnas}`}>
        {/* Liquidez hoy */}
        <Card className="flex flex-col gap-1.5 p-4">
          <CardLabel>
            <Droplets className="size-3.5 text-income" aria-hidden />
            {t('balance.liquidezHoy')}
          </CardLabel>

          <TotalDeCapa
            capa={resumen.liquidez}
            moneda={moneda}
            locale={locale}
            idioma={idioma}
            className="text-income"
          />
          <PorMoneda capa={resumen.liquidez} destino={moneda} locale={locale} />

          <p className="mt-auto pt-1.5 text-[10px] leading-snug text-subtle">
            {t('balance.liquidezDetalle')}
          </p>
        </Card>

        {/* Tarjetas y comprometido */}
        <Card
          className={`flex flex-col gap-1.5 p-4 ${
            resumen.alertaLiquidez ? 'border-budget-warn/50 bg-budget-warn/[0.06]' : ''
          }`}
        >
          <CardLabel>
            <CreditCard className="size-3.5 text-budget-warn" aria-hidden />
            {t('balance.tarjetas')}
          </CardLabel>

          <TotalDeCapa
            capa={resumen.tarjetas}
            moneda={moneda}
            locale={locale}
            idioma={idioma}
            className="text-budget-warn"
          />

          {/* Las cuotas del mes son un RECORTE del saldo de arriba, no un
              sumando: el trigger de saldo ya las metió adentro al insertarlas. */}
          {resumen.cuotasDelMes.total !== null && resumen.cuotasDelMes.total > 0 && (
            <p className="text-[10px] tabular-nums text-on-surface-variant">
              {t('balance.cuotasDelMes')}:{' '}
              <strong className="font-semibold">
                {formatearMonto(resumen.cuotasDelMes.total, moneda)}
              </strong>
            </p>
          )}

          {resumen.alertaLiquidez && (
            <p
              role="status"
              className="flex items-start gap-1.5 rounded-lg border border-budget-warn/30 bg-budget-warn/10 px-2 py-1.5 text-[10px] leading-snug text-budget-warn"
            >
              <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />
              {t('balance.alertaLiquidez')}
            </p>
          )}

          <p className="mt-auto pt-1.5 text-[10px] leading-snug text-subtle">
            {t('balance.tarjetasDetalle')} {t('balance.noSeRestan')}
          </p>
        </Card>

        {/* Inversiones y activos */}
        {mostrarInversiones && (
          <Card className="flex flex-col gap-1.5 p-4">
            <CardLabel>
              <TrendingUp className="size-3.5 text-gold-leaf" aria-hidden />
              {t('balance.inversiones')}
            </CardLabel>

            <TotalDeCapa
              capa={resumen.inversiones}
              moneda={moneda}
              locale={locale}
              idioma={idioma}
              className="text-gold-leaf"
            />
            <PorMoneda capa={resumen.inversiones} destino={moneda} locale={locale} />

            <p className="mt-auto pt-1.5 text-[10px] leading-snug text-subtle">
              {t('balance.inversionesDetalle')}
            </p>
          </Card>
        )}
      </div>
    </section>
  )
}
