'use client'

import { CargadorEnCliente } from '@/components/vistas/cargador-en-cliente'
import { VistaDeudas } from '@/components/vistas/vista-deudas'
import { GuardianDeBoveda } from '@/components/guardian-de-boveda'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import type { Moneda } from '@/lib/types'

/**
 * Deudas, leídas en el navegador. Lo monta el `page.tsx` cuando el servidor no
 * puede leer los datos de esta cuenta.
 *
 * El libro lo arma el layout, una sola vez para toda la app. Acá quedan las
 * dos capas de la pantalla:
 *
 *     GuardianDeBoveda   pide la contraseña si hace falta
 *     CargadorEnCliente  lee y le pasa los datos a la vista
 *
 * `monedas` viene del servidor porque las preferencias NO se cifran: el layout
 * ya las tiene, así que no hay motivo para volver a leerlas acá.
 */
export function DeudasEnCliente({ monedas }: { monedas: Moneda[] }) {
  return (
    <GuardianDeBoveda>
      <CargadorEnCliente
        cargar={(libro) => cargarCuentasYDeudas(libro, monedas)}
        ver={(datos) => (
          <VistaDeudas
            deudas={datos.deudas}
            patrimonio={datos.patrimonio}
            error={datos.error}
          />
        )}
      />
    </GuardianDeBoveda>
  )
}
