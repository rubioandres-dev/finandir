'use client'

import { CategoriesManagerButton } from '@/components/categories-manager-modal'
import { TransactionFeedTabs } from '@/components/transaction-feed-tabs'
import { TransactionList } from '@/components/transaction-list'
import { GuardianDeBoveda } from '@/components/guardian-de-boveda'
import {
  useFormatoRegional,
  useModoMoneda,
  useTraduccion,
} from '@/components/currency-provider'
import { CargadorEnCliente } from '@/components/vistas/cargador-en-cliente'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { esDeLaMoneda } from '@/lib/currency-mode'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { equivalenteAproximado } from '@/lib/monedas'
import { cargarFeedDeMovimientos, type FeedDeMovimientos } from '@/lib/transactions-feed'
import { createClient } from '@/lib/supabase/client'
import type { Cotizacion } from '@/lib/rates'
import type { Categoria, Cuenta, Moneda } from '@/lib/types'

export type DatosDeMovimientos = {
  categorias: Categoria[]
  cotizacion: Cotizacion | null
  cuentas: Cuenta[]
  feed: FeedDeMovimientos
  errorCarga: string | null
}

export function VistaMovimientos({ datos }: { datos: DatosDeMovimientos }) {
  const { t } = useTraduccion()
  const { modo } = useModoMoneda()
  const { formatearMonto } = useFormatoRegional()

  const { categorias, cotizacion, cuentas, feed, errorCarga } = datos

  // Para el editor: solo cuentas de la moneda activa, que son las únicas a las
  // que se puede mover un movimiento sin cambiarle la moneda.
  const cuentasElegibles = cuentas
    .filter((c) => esDeLaMoneda(c, modo))
    .map((c) => ({ id: c.id, name: c.name, type: c.type, currency: c.currency }))

  const equivalente = (m: { amount: number; currency: Moneda }) =>
    equivalenteAproximado(Number(m.amount), m.currency, cotizacion)

  const error = errorCarga ?? feed.error

  /** Mismos props para las tres listas: solo cambia el contenido y el vacío. */
  const lista = (movimientos: typeof feed.delMes, vacio: React.ReactNode) => (
    <TransactionList
      movimientos={movimientos}
      categorias={categorias}
      equivalente={equivalente}
      cuentas={cuentasElegibles}
      editable
      vacio={vacio}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-lg font-bold tracking-tight text-on-background">
          {t('mov.titulo')}
        </h1>
        <div className="flex shrink-0 items-baseline gap-3">
          <CategoriesManagerButton categorias={categorias} />
          <span className="text-xs text-subtle">{t('comun.enMoneda', { moneda: modo })}</span>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-expense/30 bg-expense/10 px-4 py-3 text-sm text-expense"
        >
          {error}
        </p>
      )}

      <TransactionFeedTabs
        contadores={{
          mes: feed.delMes.length,
          futuras: feed.totalFuturas,
          anteriores: feed.anteriores.length,
        }}
        mes={lista(feed.delMes, t('mov.sinEsteMes', { moneda: modo }))}
        futuras={
          feed.futuras.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-subtle">
              {t('mov.sinFuturas')}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {feed.futuras.map((grupo) => {
                // Cuánto cae en ese mes: es el dato que se busca al mirar acá.
                const total = grupo.movimientos.reduce(
                  (suma, movimiento) =>
                    movimiento.type === 'INCOME'
                      ? suma - Number(movimiento.amount)
                      : suma + Number(movimiento.amount),
                  0
                )

                return (
                  <section key={grupo.clave} className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">
                        {grupo.etiqueta}
                      </h2>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-gold-leaf">
                        {formatearMonto(total, modo)}
                      </span>
                    </div>
                    {lista(grupo.movimientos, null)}
                  </section>
                )
              })}
            </div>
          )
        }
        anteriores={lista(feed.anteriores, t('mov.sinAnteriores', { moneda: modo }))}
      />
    </div>
  )
}

export function MovimientosEnCliente({ monedas }: { monedas: Moneda[] }) {
  const { modo } = useModoMoneda()

  return (
    <GuardianDeBoveda>
      <CargadorEnCliente
        cargar={async (libro): Promise<DatosDeMovimientos> => {
            const supabase = createClient()
            const [dashboard, { cuentas }, feed] = await Promise.all([
              cargarDatosDelDashboard(libro, supabase, modo, monedas),
              cargarCuentasYDeudas(libro, monedas),
              cargarFeedDeMovimientos(libro, modo),
            ])
            return {
              categorias: dashboard.categorias,
              cotizacion: dashboard.cotizacion,
              errorCarga: dashboard.errorCarga,
              cuentas,
              feed,
            }
          }}
        ver={(datos) => <VistaMovimientos datos={datos} />}
      />
    </GuardianDeBoveda>
  )
}
