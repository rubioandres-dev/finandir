'use client'

import { BudgetProgress } from '@/components/budget-progress'
import { GuardianDeBoveda } from '@/components/guardian-de-boveda'
import { CargadorEnCliente } from '@/components/vistas/cargador-en-cliente'
import { armarPresupuestos } from '@/components/vistas/datos-presupuestos'
import { createClient } from '@/lib/supabase/client'
import type { Moneda } from '@/lib/types'

/** La misma pantalla, leída en el navegador cuando el servidor no puede. */
export function PresupuestosEnCliente({ monedas }: { monedas: Moneda[] }) {
  return (
    <GuardianDeBoveda>
      <CargadorEnCliente
        cargar={(libro) => armarPresupuestos(libro, createClient(), monedas)}
        ver={(datos) => (
          <BudgetProgress categorias={datos.categorias} faltaMigracion={datos.faltaMigracion} />
        )}
      />
    </GuardianDeBoveda>
  )
}
