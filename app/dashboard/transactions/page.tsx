import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { TransactionFeedTabs } from '@/components/transaction-feed-tabs'
import { TransactionList } from '@/components/transaction-list'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { esDeLaMoneda } from '@/lib/currency-mode'
import { leerModoMoneda } from '@/lib/currency-mode-server'
import { cargarDatosDelDashboard } from '@/lib/dashboard-data'
import { equivalenteAproximado } from '@/lib/monedas'
import { cargarFeedDeMovimientos } from '@/lib/transactions-feed'
import { createClient } from '@/lib/supabase/server'
import { formatearMonto } from '@/lib/types'

export const metadata: Metadata = { title: 'Movimientos' }

export default async function TransactionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const modo = await leerModoMoneda()

  // `cargarDatosDelDashboard` sigue usándose solo por las categorías y la
  // cotización; los movimientos ahora vienen del feed, partido por período.
  const [{ categorias, cotizacion, errorCarga }, { cuentas }, feed] = await Promise.all([
    cargarDatosDelDashboard(modo),
    cargarCuentasYDeudas(supabase),
    cargarFeedDeMovimientos(supabase, modo),
  ])

  // Para el editor: solo cuentas de la moneda activa, que son las únicas a las
  // que se puede mover un movimiento sin cambiarle la moneda.
  const cuentasElegibles = cuentas
    .filter((c) => esDeLaMoneda(c, modo))
    .map((c) => ({ id: c.id, name: c.name, type: c.type, currency: c.currency }))

  const equivalente = (m: { amount: number; currency: 'ARS' | 'USD' }) =>
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
          Movimientos
        </h1>
        <span className="shrink-0 text-xs text-subtle">en {modo}</span>
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
        mes={lista(feed.delMes, `Todavía no registraste movimientos en ${modo} este mes.`)}
        futuras={
          feed.futuras.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-subtle">
              No tenés cuotas pendientes de meses que vengan.
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
        anteriores={lista(
          feed.anteriores,
          `No hay movimientos en ${modo} de meses anteriores.`
        )}
      />
    </div>
  )
}
