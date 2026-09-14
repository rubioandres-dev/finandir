'use client'

import { type DatosDelGastoInteligente, deudaPorTarjetaDe } from './datos-gasto-inteligente'
import Link from 'next/link'
import { PiggyBank } from 'lucide-react'
import { SmartSpendCalculator } from '@/components/smart-spend-calculator'
import { GuardianDeBoveda } from '@/components/guardian-de-boveda'
import { CargadorEnCliente } from '@/components/vistas/cargador-en-cliente'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { cargarInversiones } from '@/lib/investments-service'
import type { Moneda } from '@/lib/types'

export function VistaGastoInteligente({
  datos,
  precioInicial,
  monedaInicial,
}: {
  datos: DatosDelGastoInteligente
  precioInicial: number | null
  monedaInicial: Moneda
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-lg font-bold tracking-tight text-on-background">
          ¿Cómo conviene pagar?
        </h1>
        <p className="text-xs leading-snug text-subtle">
          Descubrí si te conviene pagar de contado o financiar en cuotas poniendo a rendir tu
          dinero mes a mes.
        </p>
      </div>

      <SmartSpendCalculator
        tarjetas={datos.tarjetas}
        deudaPorTarjeta={datos.deudaPorTarjeta}
        tnaLiquida={datos.tnaLiquida}
        inversiones={datos.inversiones}
        precioInicial={precioInicial}
        monedaInicial={monedaInicial}
      />

      {datos.inversiones.length === 0 && (
        <Link
          href="/dashboard/investments"
          className="flex items-center gap-2.5 rounded-2xl border border-dashed border-border p-3.5 transition hover:border-primary/40"
        >
          <PiggyBank className="size-4 shrink-0 text-gold-leaf" aria-hidden />
          <span className="min-w-0 flex-1 text-sm font-medium tracking-tight">
            Cargá tus inversiones
          </span>
          <span className="shrink-0 text-[11px] text-subtle">para usar tu tasa real</span>
        </Link>
      )}
    </div>
  )
}

export function GastoInteligenteEnCliente({
  monedas,
  precioInicial,
  monedaInicial,
}: {
  monedas: Moneda[]
  precioInicial: number | null
  monedaInicial: Moneda
}) {
  return (
    <GuardianDeBoveda>
      <CargadorEnCliente
        cargar={async (libro): Promise<DatosDelGastoInteligente> => {
            const [{ tarjetas, cuentas }, { inversiones, resumen }] = await Promise.all([
              cargarCuentasYDeudas(libro, monedas),
              cargarInversiones(libro, monedas),
            ])
            return {
              tarjetas,
              deudaPorTarjeta: deudaPorTarjetaDe(cuentas),
              tnaLiquida: resumen.tnaLiquida,
              inversiones,
            }
          }}
        ver={(datos) => (
            <VistaGastoInteligente
              datos={datos}
              precioInicial={precioInicial}
              monedaInicial={monedaInicial}
            />
          )}
      />
    </GuardianDeBoveda>
  )
}
