import { CreditCard, Droplets, TrendingUp, TriangleAlert } from 'lucide-react'
import { CurrencySelector } from '@/components/currency-selector'
import { Card, CardLabel } from '@/components/ui/card'
import type { CapaDeBalance, ResumenDeBalance } from '@/lib/balance-overview'
import { crearFormateadores, type Locale } from '@/lib/formatters'
import { crearTraductor, type Clave, type Idioma } from '@/lib/i18n'
import type { Moneda } from '@/lib/types'

/**
 * Balance del Home: patrimonio neto y sus tres lecturas, en UNA sola card.
 *
 * POR QUÉ UNA Y NO CUATRO
 *
 * La versión anterior eran cuatro cards sueltas. Leídas de arriba abajo daban a
 * entender cuatro cosas independientes, cuando en realidad las tres de abajo
 * son el desglose de la de arriba: liquidez + inversiones − tarjetas ES el
 * patrimonio neto. Separarlas en superficies distintas rompía justamente la
 * relación que la pantalla existe para mostrar.
 *
 * QUÉ SE SACÓ
 *
 * Los párrafos explicativos de cada bloque. Explicaban bien —qué entra en la
 * liquidez, por qué las tarjetas no se restan— pero convertían la card en un
 * texto: cuatro renglones de prosa gris debajo de cada número. Lo que quedó es
 * lo accionable: los importes, la relación entre ellos y la alerta ámbar.
 *
 * POR QUÉ LAS TARJETAS NO SE RESTAN DE LA LIQUIDEZ
 *
 * Esta es la única regla que no se puede leer del layout, así que va acá y no
 * en pantalla: el consumo de tarjeta no sale de la caja hasta el vencimiento.
 * Restarlo daría un "disponible real" que suena prudente y es falso, y haría
 * creer que hay menos plata de la que hay. La relación entre las dos capas la
 * comunica la alerta ámbar, no una resta.
 */

/** Sub-bloque del desglose: rótulo, importe y lo que haga falta abajo. */
function Bloque({
  etiqueta,
  Icono,
  color,
  capa,
  moneda,
  locale,
  idioma,
  children,
}: {
  etiqueta: Clave
  Icono: typeof Droplets
  color: string
  capa: CapaDeBalance
  moneda: Moneda
  locale: Locale
  idioma: Idioma
  children?: React.ReactNode
}) {
  const { formatearMonto } = crearFormateadores(locale)
  const t = crearTraductor(idioma)

  // Con más de una divisa en juego, el desglose sin convertir es lo único que
  // deja ver de dónde salió el total sin creerle a ciegas al tipo de cambio.
  const detalle = capa.porMoneda.filter((linea) => linea.moneda !== moneda)

  return (
    <div className="flex min-w-0 flex-col gap-1 px-1 py-2 sm:px-3">
      <CardLabel className="text-[9px]">
        <Icono className={`size-3 ${color}`} aria-hidden />
        {t(etiqueta)}
      </CardLabel>

      {capa.total === null ? (
        <p className="text-sm font-medium text-subtle">{t('balance.sinCotizacion')}</p>
      ) : (
        <p className={`font-display text-lg font-bold tabular-nums tracking-tight ${color}`}>
          {formatearMonto(capa.total, moneda)}
        </p>
      )}

      {detalle.length > 0 && (
        <ul className="flex flex-wrap gap-x-2">
          {detalle.map(({ moneda: divisa, valor }) => (
            <li key={divisa} className="text-[10px] tabular-nums text-subtle">
              {formatearMonto(valor, divisa)}
            </li>
          ))}
        </ul>
      )}

      {children}
    </div>
  )
}

/** Un término del neto que no tiene bloque propio: "me deben", "debo". */
function Chip({
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

  if (capa.total === null || capa.total === 0) return null

  return (
    <span className="flex items-baseline gap-1.5 text-[10px] text-on-surface-variant">
      {t(etiqueta)}
      <strong
        className={`font-semibold tabular-nums ${resta ? 'text-expense' : 'text-on-background'}`}
      >
        {resta ? '−' : ''}
        {formatearMonto(capa.total, moneda)}
      </strong>
    </span>
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
  /** Módulo `investments`: apagado, el bloque no se muestra. */
  mostrarInversiones?: boolean
  /** Módulo `debts`: apagado, el chip de deuda personal no se muestra. */
  mostrarDeudas?: boolean
}) {
  const { formatearMonto } = crearFormateadores(locale)
  const t = crearTraductor(idioma)

  const { moneda, patrimonioNeto } = resumen
  const bloques = mostrarInversiones ? 'sm:grid-cols-3' : 'sm:grid-cols-2'

  return (
    <Card
      glass
      data-tour="balance"
      className="glow-gold flex flex-col gap-3 border-glass-stroke p-5"
    >
      {/* --- Cabecera ---------------------------------------------------- */}
      <div className="flex items-start justify-between gap-3">
        <CardLabel className="text-gold-leaf">{t('balance.patrimonioTotal')}</CardLabel>
        {/* El mismo selector del header. Acá tiene sentido repetirlo: es el
            control que decide en qué divisa está expresado el número grande
            que está justo debajo. */}
        <CurrencySelector cotizacion={null} />
      </div>

      {patrimonioNeto === null ? (
        <>
          <p className="font-display text-2xl font-bold tracking-tighter text-subtle">
            {t('balance.sinCotizacion')}
          </p>
          <p className="text-[11px] leading-snug text-subtle">
            {t('balance.sinCotizacionCorto', { monedas: resumen.sinCotizacion.join(', ') })}
          </p>
        </>
      ) : (
        <p
          className={`font-display text-[2.25rem] font-bold leading-none tracking-tighter tabular-nums ${
            patrimonioNeto < 0 ? 'text-expense' : 'text-gold-leaf'
          }`}
        >
          {formatearMonto(patrimonioNeto, moneda)}
        </p>
      )}

      {/* Los dos términos del neto que no tienen bloque propio abajo. Sin
          esto el número grande no se puede reconstruir. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Chip
          etiqueta="consolidado.meDeben"
          capa={resumen.porCobrar}
          moneda={moneda}
          locale={locale}
          idioma={idioma}
        />
        {mostrarDeudas && (
          <Chip
            etiqueta="consolidado.deudasPersonales"
            capa={resumen.deudaPersonal}
            moneda={moneda}
            locale={locale}
            idioma={idioma}
            resta
          />
        )}
      </div>

      <div className="fire-gradient h-px w-full opacity-40" aria-hidden />

      {/* --- Las tres lecturas, adentro de la misma superficie ------------ */}
      <div
        className={`grid grid-cols-1 gap-y-2 divide-y divide-glass-stroke/25 sm:gap-y-0 sm:divide-x sm:divide-y-0 ${bloques}`}
      >
        <Bloque
          etiqueta="balance.liquidezHoy"
          Icono={Droplets}
          color="text-income"
          capa={resumen.liquidez}
          moneda={moneda}
          locale={locale}
          idioma={idioma}
        />

        <Bloque
          etiqueta="balance.tarjetas"
          Icono={CreditCard}
          color="text-budget-warn"
          capa={resumen.tarjetas}
          moneda={moneda}
          locale={locale}
          idioma={idioma}
        >
          {/* Las cuotas del mes son un RECORTE del saldo de arriba, no un
              sumando: el trigger de saldo ya las metió adentro al insertarlas. */}
          {resumen.cuotasDelMes.total !== null && resumen.cuotasDelMes.total > 0 && (
            <p className="text-[10px] tabular-nums text-on-surface-variant">
              {t('balance.venceEsteMes')}{' '}
              <strong className="font-semibold">
                {formatearMonto(resumen.cuotasDelMes.total, moneda)}
              </strong>
            </p>
          )}

          {resumen.alertaLiquidez && (
            <p
              role="status"
              className="mt-0.5 flex items-start gap-1 rounded-lg border border-budget-warn/40 bg-budget-warn/10 px-1.5 py-1 text-[10px] leading-tight text-budget-warn"
            >
              <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />
              {t('balance.alertaCorta')}
            </p>
          )}
        </Bloque>

        {mostrarInversiones && (
          <div data-tour="inversiones" className="min-w-0">
            <Bloque
              etiqueta="balance.inversiones"
              Icono={TrendingUp}
              color="text-gold-leaf"
              capa={resumen.inversiones}
              moneda={moneda}
              locale={locale}
              idioma={idioma}
            />
          </div>
        )}
      </div>
    </Card>
  )
}
