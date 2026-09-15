import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PieChart } from 'lucide-react'
import { BudgetProgress, type PresupuestoDeCategoria } from '@/components/budget-progress'
import { PresupuestosEnCliente } from '@/components/vistas/vista-presupuestos'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { armarPresupuestos } from '@/components/vistas/datos-presupuestos'
import { crearTraductor } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'

export const metadata: Metadata = { title: 'Presupuestos' }

/**
 * PRESUPUESTOS POR CATEGORÍA — su propia pantalla
 * =============================================================================
 *
 * Vivía adentro de Ajustes, y el menú llevaba a `/dashboard/settings#presupuestos`.
 * Nunca fue un ajuste de la app: es plata, se mira seguido, y estaba al final de
 * una pantalla larga de preferencias.
 *
 * El comentario que justificaba el ancla decía que una pantalla propia "sería la
 * misma card sola". Es cierto, y está bien que lo sea: una sección que el
 * usuario busca por su nombre merece una dirección con ese nombre.
 */
export default async function BudgetsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { monedas, idioma } = await cargarContextoDeMonedas()
  const tr = crearTraductor(idioma)

  let datos: PresupuestoDeCategoria[] | null = null
  let faltaMigracion = false

  try {
    const libro = await libroDelServidor(supabase, user.id)
    const armado = await armarPresupuestos(libro, supabase, monedas)
    datos = armado.categorias
    faltaMigracion = armado.faltaMigracion
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-on-background">
        <PieChart className="size-5 text-gold-leaf" aria-hidden />
        {tr('presupuestos.titulo')}
      </h1>

      {datos ? (
        <BudgetProgress categorias={datos} faltaMigracion={faltaMigracion} />
      ) : (
        <PresupuestosEnCliente monedas={monedas} />
      )}
    </div>
  )
}
