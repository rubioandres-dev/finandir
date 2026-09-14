'use client'

import { tarjetasDe } from './datos-importar'
import { FileScan } from 'lucide-react'
import { StatementImporter } from '@/components/statement-importer'
import { GuardianDeBoveda } from '@/components/guardian-de-boveda'
import { CargadorEnCliente } from '@/components/vistas/cargador-en-cliente'
import { obtenerCuentasPorMoneda } from '@/lib/finanzas'
import type { CuentaElegible } from '@/lib/types'

/**
 * Importar resumen de tarjeta.
 *
 * La vista y su cargador de navegador viven en el mismo archivo: son dos caras
 * de la misma pantalla y separarlas obligaría a saltar entre ficheros para
 * entender una sola cosa. El `page.tsx` importa la que necesite según pueda o
 * no leer en el servidor.
 */
export function VistaImportar({ tarjetas }: { tarjetas: CuentaElegible[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-on-background">
          <FileScan className="size-5 text-gold-leaf" aria-hidden />
          Importar resumen
        </h1>
        <p className="mt-1 text-sm text-muted">
          Subí el PDF de tu tarjeta y la IA extrae los consumos. Los que ya tenés cargados se
          detectan solos y no se duplican.
        </p>
      </div>

      {tarjetas.length === 0 && (
        <p className="rounded-2xl border border-budget-warn/30 bg-budget-warn/10 px-4 py-3 text-sm text-budget-warn">
          Primero cargá una tarjeta de crédito en Cuentas para poder importar su resumen.
        </p>
      )}

      <StatementImporter tarjetas={tarjetas} />
    </div>
  )
}

export function ImportarEnCliente() {
  return (
    <GuardianDeBoveda>
      <CargadorEnCliente
        cargar={async (libro) => tarjetasDe((await obtenerCuentasPorMoneda(libro)).cuentas)}
        ver={(tarjetas) => <VistaImportar tarjetas={tarjetas} />}
      />
    </GuardianDeBoveda>
  )
}
