import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Coins, Scale, TrendingDown, Wallet } from 'lucide-react'
import { Card, CardLabel } from '@/components/ui/card'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { consolidar, type LadoDeLaMoneda } from '@/lib/consolidated-service'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { obtenerMapaDeCambio } from '@/lib/exchange'
import { cargarInversiones } from '@/lib/investments-service'
import { nombreDeMoneda } from '@/lib/monedas'
import { obtenerCotizacionDelDia } from '@/lib/rates'
import { createClient } from '@/lib/supabase/server'
import { crearFormateadores, type Locale } from '@/lib/formatters'
import type { Moneda } from '@/lib/types'

export const metadata: Metadata = { title: 'Consolidado' }

/** Una línea del desglose: rótulo, monto y si suma o resta. */
function Linea({
  etiqueta,
  valor,
  moneda,
  locale,
  resta = false,
}: {
  etiqueta: string
  valor: number
  moneda: Moneda
  locale: Locale
  resta?: boolean
}) {
  const { formatearMonto } = crearFormateadores(locale)

  if (valor === 0) return null

  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0 truncate text-[11px] text-on-surface-variant">{etiqueta}</span>
      <span
        className={`shrink-0 text-sm font-medium tabular-nums ${
          resta ? 'text-expense' : 'text-on-background'
        }`}
      >
        {resta ? '−' : ''}
        {formatearMonto(valor, moneda)}
      </span>
    </div>
  )
}

/**
 * Un bloque del comparativo. Todos tienen exactamente las mismas filas, en el
 * mismo orden: la simetría es lo que hace comparable la lectura.
 */
function Columna({
  lado,
  principal,
  locale,
}: {
  lado: LadoDeLaMoneda
  principal: Moneda
  locale: Locale
}) {
  const { formatearMonto } = crearFormateadores(locale)
  const esPrincipal = lado.moneda === principal

  return (
    <Card glass className="flex h-full flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <CardLabel className="text-gold-leaf">
          <Coins className="size-3.5" aria-hidden />
          {nombreDeMoneda(lado.moneda)}
        </CardLabel>
        <span className="aurem-caps text-[9px] text-on-surface-variant/60">{lado.moneda}</span>
      </div>

      {lado.vacio ? (
        <p className="py-6 text-center text-xs text-subtle">
          Sin activos ni deudas en {lado.moneda}.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-glass-stroke/25">
          <Linea etiqueta="Cuentas y billeteras" valor={lado.liquido} moneda={lado.moneda} locale={locale} />
          <Linea etiqueta="Inversiones" valor={lado.inversiones} moneda={lado.moneda} locale={locale} />
          <Linea etiqueta="Me deben" valor={lado.porCobrar} moneda={lado.moneda} locale={locale} />
          <Linea
            etiqueta="Deuda de tarjetas"
            valor={lado.deudaTarjetas}
            moneda={lado.moneda}
            locale={locale}
            resta
          />
          <Linea
            etiqueta="Deudas personales"
            valor={lado.deudaPersonal}
            moneda={lado.moneda}
            locale={locale}
            resta
          />
        </div>
      )}

      <div className="mt-auto flex items-baseline justify-between gap-3 border-t border-glass-stroke/50 pt-2.5">
        <span className="aurem-caps text-[9px] text-on-surface-variant/70">Neto</span>
        <span className="text-right">
          <span
            className={`font-display text-lg font-bold tabular-nums ${
              lado.neto < 0 ? 'text-expense' : 'text-gold-leaf'
            }`}
          >
            {formatearMonto(lado.neto, lado.moneda)}
          </span>

          {/* El equivalente en la principal es lo que hace comparables dos
              columnas de monedas distintas de un vistazo. */}
          {!esPrincipal && !lado.vacio && (
            <span className="block text-[10px] tabular-nums text-subtle">
              {lado.netoEnPrincipal === null
                ? 'sin cotización'
                : `≈ ${formatearMonto(lado.netoEnPrincipal, principal)}`}
            </span>
          )}
        </span>
      </div>
    </Card>
  )
}

/** Un total cruzado por divisa, para leer la magnitud sin convertir nada. */
function TotalCruzado({
  etiqueta,
  Icono,
  color,
  valores,
  locale,
}: {
  etiqueta: string
  Icono: typeof Wallet
  color: string
  valores: { moneda: Moneda; valor: number }[]
  locale: Locale
}) {
  const { formatearMonto } = crearFormateadores(locale)
  const conSaldo = valores.filter((v) => v.valor !== 0)

  return (
    <Card className="p-4">
      <CardLabel>
        <Icono className={`size-3.5 ${color}`} aria-hidden />
        {etiqueta}
      </CardLabel>
      <div className="mt-2 flex flex-col gap-0.5">
        {conSaldo.length === 0 ? (
          <span className="text-sm text-subtle">—</span>
        ) : (
          conSaldo.map(({ moneda, valor }) => (
            <span key={moneda} className={`text-sm font-semibold tabular-nums ${color}`}>
              {formatearMonto(valor, moneda)}
            </span>
          ))
        )}
      </div>
    </Card>
  )
}

export default async function ConsolidatedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Esta vista IGNORA a propósito la moneda activa del header: su razón de
  // existir es mostrar todos los libros a la vez.
  const { monedas, locale } = await cargarContextoDeMonedas()
  const { formatearMonto } = crearFormateadores(locale)

  const [{ patrimonio, error: errorCuentas }, { resumen, error: errorInversiones }, cotizacion] =
    await Promise.all([
      cargarCuentasYDeudas(supabase, monedas),
      cargarInversiones(supabase, monedas),
      obtenerCotizacionDelDia(supabase),
    ])

  // El MEP ya resuelto se le pasa al mapa para no pedirlo dos veces; el resto
  // de las divisas se cotiza contra el peso.
  const { mapa } = await obtenerMapaDeCambio(supabase, monedas, cotizacion?.venta ?? null)

  const consolidado = consolidar(patrimonio, resumen, monedas, mapa, cotizacion)
  const error = errorCuentas ?? errorInversiones

  const liquidezTotal = consolidado.lados.map((l) => ({ moneda: l.moneda, valor: l.liquido }))
  const pasivosTotales = consolidado.lados.map((l) => ({
    moneda: l.moneda,
    valor: l.deudaTarjetas + l.deudaPersonal,
  }))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-lg font-bold tracking-tight text-on-background">
          Patrimonio consolidado
        </h1>
        <p className="text-xs leading-snug text-subtle">
          El único lugar donde tus libros se suman. En el resto de la app cada divisa va por
          separado.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-expense/30 bg-expense/10 px-4 py-3 text-sm text-expense"
        >
          {error}
        </p>
      )}

      {/* --- Patrimonio neto unificado ----------------------------------- */}
      <Card glass className="glow-gold flex flex-col gap-2 p-5">
        <CardLabel className="text-gold-leaf">
          <Scale className="size-3.5" aria-hidden />
          Patrimonio neto unificado · {consolidado.principal}
        </CardLabel>

        {consolidado.patrimonioUnificado === null ? (
          <>
            <p className="mt-1 font-display text-2xl font-bold tracking-tighter text-subtle">
              Sin cotización
            </p>
            <p className="text-[11px] leading-snug text-subtle">
              No se pudo cotizar {consolidado.sinCotizacion.join(', ')}, así que no se unifican los
              libros. Preferimos no mostrar un total antes que mostrarlo con un tipo de cambio
              inventado.
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 font-display text-[2rem] font-bold leading-tight tracking-tighter tabular-nums text-gold-leaf">
              {formatearMonto(consolidado.patrimonioUnificado, consolidado.principal)}
            </p>
            <div className="fire-gradient mt-3 h-px w-full opacity-40" aria-hidden />
            <p className="text-[10px] leading-snug text-subtle">
              Expresado en {nombreDeMoneda(consolidado.principal).toLowerCase()}, tu divisa
              principal.
              {consolidado.cotizacion &&
                ` Dólar MEP del ${consolidado.cotizacion.fecha} a ${consolidado.cotizacion.venta.toLocaleString(
                  'es-AR',
                  { maximumFractionDigits: 0 }
                )}.`}{' '}
              Es una foto a los tipos de cambio de hoy, no un saldo contable: si se mueven, este
              número se mueve sin que hayas hecho nada.
            </p>
          </>
        )}
      </Card>

      {/* --- Comparativa simétrica: un bloque por divisa ------------------ */}
      <section className="grid items-stretch gap-3 sm:grid-cols-2">
        {consolidado.lados.map((lado) => (
          <Columna
            key={lado.moneda}
            lado={lado}
            principal={consolidado.principal}
            locale={locale}
          />
        ))}
      </section>

      {/* --- Totales cruzados -------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3">
        <TotalCruzado
          etiqueta="Liquidez total"
          Icono={Wallet}
          color="text-income"
          valores={liquidezTotal}
          locale={locale}
        />
        <TotalCruzado
          etiqueta="Pasivos totales"
          Icono={TrendingDown}
          color="text-expense"
          valores={pasivosTotales}
          locale={locale}
        />
      </div>
    </div>
  )
}
