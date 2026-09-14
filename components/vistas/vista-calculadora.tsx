'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NightOutCalculator } from '@/components/night-out-calculator'
import { GuardianDeBoveda } from '@/components/guardian-de-boveda'
import { useModoMoneda, useTraduccion } from '@/components/currency-provider'
import { CargadorEnCliente } from '@/components/vistas/cargador-en-cliente'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { esDeLaMoneda } from '@/lib/currency-mode'
import type { CuentaElegible, Moneda } from '@/lib/types'

export type DatosDeLaCalculadora = {
  categorias: { nombre: string }[]
  cuentas: CuentaElegible[]
}

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

/**
 * El recorte por moneda y por tipo vive acá para que las dos rutas lo hagan
 * igual. Duplicarlo en el `page.tsx` y en el cargador es como terminan
 * divergiendo: alguien arregla uno y no se acuerda del otro.
 */
export function armarDatosDeLaCalculadora(
  categorias: { name: string; type: string }[],
  cuentas: { id: string; name: string; type: string; currency: string }[],
  modo: Moneda
): DatosDeLaCalculadora {
  return {
    // Solo categorías de gasto: es lo único que una salida puede imputar.
    categorias: categorias
      .filter((c) => c.type === 'EXPENSE')
      .map((c) => ({ nombre: c.name })),
    // Solo las de la moneda activa: `guardarTransaccion` rechaza una cuenta
    // cuya divisa no coincide, así que ofrecer las demás sería ofrecer un error.
    cuentas: cuentas
      .filter((c) => esDeLaMoneda(c, modo))
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type as CuentaElegible['type'],
        currency: c.currency,
      })),
  }
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
