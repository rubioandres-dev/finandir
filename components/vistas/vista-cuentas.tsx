'use client'

import Link from 'next/link'
import { FileScan, PiggyBank, TrendingDown } from 'lucide-react'
import { AccountForm } from '@/components/account-form'
import { AccountRow } from '@/components/account-row'
import { Card, CardLabel } from '@/components/ui/card'
import { GuardianDeBoveda } from '@/components/guardian-de-boveda'
import {
  useFormatoRegional,
  useModoMoneda,
  useTraduccion,
} from '@/components/currency-provider'
import { CargadorEnCliente } from '@/components/vistas/cargador-en-cliente'
import { cargarCuentasYDeudas, type Patrimonio } from '@/lib/accounts-service'
import { esDeLaMoneda } from '@/lib/currency-mode'
import type { Cuenta, Moneda, Tarjeta } from '@/lib/types'

export type DatosDeCuentas = {
  cuentas: Cuenta[]
  tarjetas: Tarjeta[]
  patrimonio: Patrimonio
  error: string | null
}

/**
 * El recorte por moneda se hace ACA y no en el cargador: depende del selector
 * del header, que es estado del cliente. Cambiar de divisa deja de pedir una
 * vuelta al servidor.
 */
export function VistaCuentas({ datos }: { datos: DatosDeCuentas }) {
  const { t } = useTraduccion()
  const { modo } = useModoMoneda()
  const { formatearMonto } = useFormatoRegional()

  const { cuentas, tarjetas, patrimonio, error } = datos
  const detallePorCuenta = new Map(tarjetas.map((x) => [x.id, x.detalle]))

  // El modo del header manda: en ARS no se listan las cuentas en dólares.
  const cuentasVisibles = cuentas.filter((c) => esDeLaMoneda(c, modo))

  // Las métricas de arriba también quedan en una sola moneda, para que no
  // contradigan al listado de abajo.
  const soloModo = (totales: { moneda: Moneda; valor: number }[]) =>
    totales.filter((total) => total.moneda === modo)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-lg font-bold tracking-tight text-on-background">{t('cuentas.titulo')}</h1>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-expense/30 bg-expense/10 px-4 py-3 text-sm text-expense"
        >
          {error}
        </p>
      )}

      {/* Resumen patrimonial, siempre desagregado por moneda. */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <CardLabel>{t('cuentas.liquido')}</CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {soloModo(patrimonio.liquido).map((t) => (
              <span key={t.moneda} className="text-sm font-semibold tabular-nums text-income">
                {formatearMonto(t.valor, t.moneda)}
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <CardLabel>{t('cuentas.deudaTarjetas')}</CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {soloModo(patrimonio.deudaTarjetas).map((t) => (
              <span key={t.moneda} className="text-sm font-semibold tabular-nums text-expense">
                {formatearMonto(t.valor, t.moneda)}
              </span>
            ))}
          </div>
        </Card>

        <Card glass className="glow-gold col-span-2 p-4">
          <CardLabel className="text-gold-leaf">{t('cuentas.patrimonioNeto')}</CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {soloModo(patrimonio.patrimonioNeto).map((t) => (
              <span
                key={t.moneda}
                className="font-display text-xl font-bold tabular-nums tracking-tighter text-gold-leaf"
              >
                {formatearMonto(t.valor, t.moneda)}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            {t('cuentas.formula')}
          </p>
        </Card>
      </div>

      {/* Solo la moneda activa: el toggle del header es el que elige el libro. */}
      {cuentasVisibles.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="aurem-caps text-[11px] text-on-surface-variant/75">{t('cuentas.enMoneda', { moneda: modo })}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {cuentasVisibles.map((cuenta) => (
              <AccountRow
                key={cuenta.id}
                cuenta={cuenta}
                detalle={detallePorCuenta.get(cuenta.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Accesos a las vistas que dependen de las tarjetas. */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/dashboard/investments"
          className="col-span-2 flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 transition hover:border-primary/40"
        >
          <PiggyBank className="size-4 shrink-0 text-gold-leaf" aria-hidden />
          <span className="min-w-0 flex-1 text-sm font-medium tracking-tight">{t('nav.inversiones')}</span>
          <span className="shrink-0 text-[11px] text-subtle">{t('cuentas.carteraYRendimiento')}</span>
        </Link>

        <Link
          href="/dashboard/commitments"
          className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 transition hover:border-primary/40"
        >
          <TrendingDown className="size-4 shrink-0 text-wealth" aria-hidden />
          <span className="min-w-0 text-sm font-medium tracking-tight">{t('modulos.cuotas')}</span>
        </Link>

        <Link
          href="/dashboard/cards/import"
          className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 transition hover:border-primary/40"
        >
          <FileScan className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 text-sm font-medium tracking-tight">{t('cuentas.importarResumen')}</span>
        </Link>
      </div>

      {cuentasVisibles.length === 0 && !error && (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-subtle">
          {t('cuentas.sinCuentas', { moneda: modo })}
        </p>
      )}

      <AccountForm />
    </div>
  )
}

export function CuentasEnCliente({ monedas }: { monedas: Moneda[] }) {
  return (
    <GuardianDeBoveda>
      <CargadorEnCliente
        cargar={(libro) => cargarCuentasYDeudas(libro, monedas)}
        ver={(datos) => <VistaCuentas datos={datos} />}
      />
    </GuardianDeBoveda>
  )
}
