'use client'

import Link from 'next/link'
import { Coins, Lightbulb, Percent, TrendingUp } from 'lucide-react'
import { InvestmentDistribution } from '@/components/investment-distribution'
import { InvestmentManager } from '@/components/investment-manager'
import { InvestmentsTourButton } from '@/components/investments-tour'
import { Card, CardLabel } from '@/components/ui/card'
import { GuardianDeBoveda } from '@/components/guardian-de-boveda'
import { ProveedorDeLibro } from '@/components/libro-provider'
import {
  useFormatoRegional,
  useModoMoneda,
  useTraduccion,
} from '@/components/currency-provider'
import { CargadorEnCliente } from '@/components/vistas/cargador-en-cliente'
import {
  cargarInversiones,
  distribucionPorTipo,
  gananciaMensualEstimada,
  type ResumenDeInversiones,
} from '@/lib/investments-service'
import { normalizarMoneda } from '@/lib/monedas'
import type { Inversion, Moneda } from '@/lib/types'

export type DatosDeInversiones = {
  inversiones: Inversion[]
  resumen: ResumenDeInversiones
  error: string | null
}

/**
 * Los KPI se derivan ACÁ y no en el cargador, a propósito.
 *
 * Todos dependen del modo de moneda del header, que es estado del cliente.
 * Calcularlos arriba obligaría a recargar la página entera para cambiar de
 * divisa; derivarlos en la vista los hace instantáneos y deja a los dos
 * cargadores devolviendo exactamente lo mismo.
 */
export function VistaInversiones({ datos }: { datos: DatosDeInversiones }) {
  const { t } = useTraduccion()
  const { modo } = useModoMoneda()
  const { formatearMonto, locale, oculto } = useFormatoRegional()

  const { inversiones, resumen, error } = datos

  /**
   * Esta vista respeta el selector del header, como Cuentas y Movimientos.
   *
   * Antes apilaba un renglón por divisa en cada métrica. Se veía la cartera
   * completa sin tocar nada, pero los tres números crecían hacia abajo y
   * ninguno era comparable con el otro: dos TNA de monedas distintas no se
   * promedian ni se ordenan. Con un solo libro a la vez, cada KPI vuelve a ser
   * un número.
   */
  const deLaMoneda = inversiones.filter((i) => normalizarMoneda(i.currency) === modo)

  const valorTotal = resumen.valorActual.find((v) => v.moneda === modo)?.valor ?? 0
  const resultado = resumen.resultado.find((r) => r.moneda === modo)?.valor ?? 0
  const tnaPonderada = resumen.tnaLiquida[modo] ?? null
  const gananciaMensual = gananciaMensualEstimada(inversiones, modo)
  const tramos = distribucionPorTipo(inversiones, modo)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-lg font-bold tracking-tight text-on-background">
          {t('nav.inversiones')}{' '}
          <span className="text-sm font-medium text-subtle">
            {t('comun.enMoneda', { moneda: modo })}
          </span>
        </h1>
        <InvestmentsTourButton />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-expense/30 bg-expense/10 px-4 py-3 text-sm text-expense"
        >
          {error}
        </p>
      )}

      {/* --- Los tres KPI que definen la cartera --------------------------- */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card glass data-tour="inv-total" className="glow-gold flex flex-col gap-1 p-4">
          <CardLabel className="text-gold-leaf">
            <TrendingUp className="size-3.5" aria-hidden />
            {t('inv.totalInvertido')}
          </CardLabel>

          <p className="font-display text-[1.6rem] font-bold leading-tight tracking-tighter tabular-nums text-gold-leaf">
            {formatearMonto(valorTotal, modo)}
          </p>

          {/* Resultado contra el costo: es lo único que dice si va bien. */}
          {resultado !== 0 && (
            <p
              className={`text-[11px] font-medium tabular-nums ${
                resultado > 0 ? 'text-income' : 'text-expense'
              }`}
            >
              {resultado > 0 ? '+' : '−'}
              {formatearMonto(Math.abs(resultado), modo)} {t('inv.sobreLoInvertido')}
            </p>
          )}
        </Card>

        <Card glass data-tour="inv-tna" className="flex flex-col gap-1 p-4">
          <CardLabel>
            <Percent className="size-3.5 text-gold-leaf" aria-hidden />
            {t('inv.tnaPonderada')}
          </CardLabel>

          <p className="font-display text-[1.6rem] font-bold leading-tight tracking-tighter tabular-nums text-gold-leaf">
            {tnaPonderada === null ? '—' : `${tnaPonderada}%`}
          </p>

          <p className="text-[10px] leading-snug text-subtle">{t('inv.tnaAlimenta')}</p>
        </Card>

        <Card glass data-tour="inv-pasiva" className="flex flex-col gap-1 p-4">
          <CardLabel>
            <Coins className="size-3.5 text-success-emerald" aria-hidden />
            {t('inv.gananciaPasiva')}
          </CardLabel>

          <p className="font-display text-[1.6rem] font-bold leading-tight tracking-tighter tabular-nums text-success-emerald">
            {formatearMonto(gananciaMensual, modo)}
          </p>

          <p className="text-[10px] leading-snug text-subtle">{t('inv.gananciaPasivaDetalle')}</p>
        </Card>
      </section>

      {tramos.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
            {t('inv.distribucion')}
          </h2>
          <InvestmentDistribution tramos={tramos} moneda={modo} locale={locale} oculto={oculto} />
        </section>
      )}

      {/* El listado también respeta el libro activo. */}
      <InvestmentManager inversiones={deLaMoneda} />

      {/* El puente con la otra mitad del módulo: la cartera define la tasa con
          la que el asistente decide cómo pagar. */}
      <Link
        href="/dashboard/smart-spend"
        className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 transition hover:border-primary/40"
      >
        <Lightbulb className="size-4 shrink-0 text-gold-leaf" aria-hidden />
        <span className="min-w-0 flex-1 text-sm font-medium tracking-tight">
          ¿Cómo conviene pagar?
        </span>
        <span className="shrink-0 text-[11px] text-subtle">{t('inv.asistenteDeGasto')}</span>
      </Link>
    </div>
  )
}

export function InversionesEnCliente({ monedas }: { monedas: Moneda[] }) {
  return (
    <ProveedorDeLibro>
      <GuardianDeBoveda>
        <CargadorEnCliente
          cargar={(libro) => cargarInversiones(libro, monedas)}
          ver={(datos) => <VistaInversiones datos={datos} />}
        />
      </GuardianDeBoveda>
    </ProveedorDeLibro>
  )
}
