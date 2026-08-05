import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Landmark, PiggyBank, Scale, TrendingDown, Wallet } from 'lucide-react'
import { Card, CardLabel } from '@/components/ui/card'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { consolidar, type LadoDeLaMoneda } from '@/lib/consolidated-service'
import { cargarInversiones } from '@/lib/investments-service'
import { obtenerCotizacionDelDia } from '@/lib/rates'
import { createClient } from '@/lib/supabase/server'
import { formatearMonto, type Moneda } from '@/lib/types'

export const metadata: Metadata = { title: 'Consolidado' }

/** Una línea del desglose: rótulo, monto y si suma o resta. */
function Linea({
  etiqueta,
  valor,
  moneda,
  resta = false,
}: {
  etiqueta: string
  valor: number
  moneda: Moneda
  resta?: boolean
}) {
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
 * Una columna del comparativo. Las dos tienen exactamente las mismas filas,
 * en el mismo orden: la simetría es lo que hace comparable la lectura.
 */
function Columna({ lado, cotizacionVenta }: { lado: LadoDeLaMoneda; cotizacionVenta: number | null }) {
  const esPesos = lado.moneda === 'ARS'
  const vacio =
    lado.liquido === 0 &&
    lado.inversiones === 0 &&
    lado.porCobrar === 0 &&
    lado.deudaTarjetas === 0 &&
    lado.deudaPersonal === 0

  return (
    <Card glass className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <CardLabel className="text-gold-leaf">
          {esPesos ? (
            <Landmark className="size-3.5" aria-hidden />
          ) : (
            <PiggyBank className="size-3.5" aria-hidden />
          )}
          {esPesos ? 'En pesos' : 'En dólares'}
        </CardLabel>
        <span className="aurem-caps text-[9px] text-on-surface-variant/60">{lado.moneda}</span>
      </div>

      {vacio ? (
        <p className="py-6 text-center text-xs text-subtle">
          Sin activos ni deudas en {lado.moneda}.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-glass-stroke/25">
          <Linea etiqueta="Cuentas y billeteras" valor={lado.liquido} moneda={lado.moneda} />
          <Linea etiqueta="Inversiones" valor={lado.inversiones} moneda={lado.moneda} />
          <Linea etiqueta="Me deben" valor={lado.porCobrar} moneda={lado.moneda} />
          <Linea
            etiqueta="Deuda de tarjetas"
            valor={lado.deudaTarjetas}
            moneda={lado.moneda}
            resta
          />
          <Linea etiqueta="Deudas personales" valor={lado.deudaPersonal} moneda={lado.moneda} resta />
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
          {/* En la columna de pesos se muestra su equivalente para poder
              compararla con la de dólares de un vistazo. */}
          {esPesos && lado.netoEnUsd !== null && cotizacionVenta && (
            <span className="block text-[10px] tabular-nums text-subtle">
              ≈ {formatearMonto(lado.netoEnUsd, 'USD')}
            </span>
          )}
        </span>
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

  // Esta vista IGNORA a propósito el modo de moneda del header: su razón de
  // existir es mostrar los dos libros a la vez.
  const [{ patrimonio, error: errorCuentas }, { resumen, error: errorInversiones }, cotizacion] =
    await Promise.all([
      cargarCuentasYDeudas(supabase),
      cargarInversiones(supabase),
      obtenerCotizacionDelDia(supabase),
    ])

  const consolidado = consolidar(patrimonio, resumen, cotizacion)
  const error = errorCuentas ?? errorInversiones

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-lg font-bold tracking-tight text-on-background">
          Patrimonio consolidado
        </h1>
        <p className="text-xs leading-snug text-subtle">
          El único lugar donde los dos libros se suman. En el resto de la app, pesos y dólares van
          por separado.
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
          Patrimonio neto unificado
        </CardLabel>

        {consolidado.patrimonioUnificadoUsd === null ? (
          <>
            <p className="mt-1 font-display text-2xl font-bold tracking-tighter text-subtle">
              Sin cotización
            </p>
            <p className="text-[11px] leading-snug text-subtle">
              No se pudo obtener el dólar MEP, así que no se unifican los dos libros. Preferimos no
              mostrar un total antes que mostrarlo con un tipo de cambio inventado.
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 font-display text-[2rem] font-bold leading-tight tracking-tighter tabular-nums text-gold-leaf">
              {formatearMonto(consolidado.patrimonioUnificadoUsd, 'USD')}
            </p>
            {consolidado.patrimonioUnificadoArs !== null && (
              <p className="text-sm font-medium tabular-nums text-on-surface-variant">
                ≈ {formatearMonto(consolidado.patrimonioUnificadoArs, 'ARS')}
              </p>
            )}
            <div className="fire-gradient mt-3 h-px w-full opacity-40" aria-hidden />
            <p className="text-[10px] leading-snug text-subtle">
              Convertido al dólar MEP de {consolidado.cotizacion?.fecha} a{' '}
              {consolidado.cotizacion?.venta.toLocaleString('es-AR', {
                maximumFractionDigits: 0,
              })}
              . Es una foto a ese tipo de cambio, no un saldo contable: si el MEP se mueve, este
              número se mueve sin que hayas hecho nada.
            </p>
          </>
        )}
      </Card>

      {/* --- Comparativa simétrica --------------------------------------- */}
      <section className="grid gap-3 sm:grid-cols-2 sm:items-stretch">
        <Columna lado={consolidado.ars} cotizacionVenta={cotizacion?.venta ?? null} />
        <Columna lado={consolidado.usd} cotizacionVenta={cotizacion?.venta ?? null} />
      </section>

      {/* --- Totales cruzados -------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <CardLabel>
            <Wallet className="size-3.5 text-income" aria-hidden />
            Liquidez total
          </CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            <span className="text-sm font-semibold tabular-nums text-income">
              {formatearMonto(consolidado.ars.liquido, 'ARS')}
            </span>
            <span className="text-sm font-semibold tabular-nums text-income">
              {formatearMonto(consolidado.usd.liquido, 'USD')}
            </span>
          </div>
        </Card>

        <Card className="p-4">
          <CardLabel>
            <TrendingDown className="size-3.5 text-expense" aria-hidden />
            Pasivos totales
          </CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            <span className="text-sm font-semibold tabular-nums text-expense">
              {formatearMonto(
                consolidado.ars.deudaTarjetas + consolidado.ars.deudaPersonal,
                'ARS'
              )}
            </span>
            <span className="text-sm font-semibold tabular-nums text-expense">
              {formatearMonto(
                consolidado.usd.deudaTarjetas + consolidado.usd.deudaPersonal,
                'USD'
              )}
            </span>
          </div>
        </Card>
      </div>
    </div>
  )
}
