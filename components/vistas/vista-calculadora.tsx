'use client'

import { type DatosDeLaCalculadora, armarDatosDeLaCalculadora } from './datos-calculadora'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NightOutCalculator } from '@/components/night-out-calculator'
import { GuardianDeBoveda } from '@/components/guardian-de-boveda'
import { useModoMoneda, useTraduccion } from '@/components/currency-provider'
import { CargadorEnCliente } from '@/components/vistas/cargador-en-cliente'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import type { Moneda } from '@/lib/types'

export function VistaCalculadora({ datos }: { datos: DatosDeLaCalculadora }) {
  const { t } = useTraduccion()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/shared-expenses"
          aria-label="Volver"
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-glass-stroke/50 text-on-surface-variant transition hover:border-gold-leaf/60 hover:text-gold-leaf"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate font-display text-lg font-bold tracking-tight text-on-background">
            {t('calculadora.titulo')}
          </h1>
          <p className="text-[11px] leading-snug text-subtle">{t('calculadora.bajada')}</p>
        </div>
      </div>

      <NightOutCalculator categorias={datos.categorias} cuentas={datos.cuentas} />
    </div>
  )
}

export function CalculadoraEnCliente({ monedas }: { monedas: Moneda[] }) {
  const { modo } = useModoMoneda()

  return (
    <GuardianDeBoveda>
      <CargadorEnCliente
        cargar={async (libro) => {
            const [categorias, { cuentas }] = await Promise.all([
              libro.leer('categorias'),
              cargarCuentasYDeudas(libro, monedas),
            ])
            return armarDatosDeLaCalculadora(categorias, cuentas, modo)
          }}
        ver={(datos) => <VistaCalculadora datos={datos} />}
      />
    </GuardianDeBoveda>
  )
}
