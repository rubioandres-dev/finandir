import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import {
  armarDatosDeLaCalculadora,
  CalculadoraEnCliente,
  VistaCalculadora,
  type DatosDeLaCalculadora,
} from '@/components/vistas/vista-calculadora'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Calculadora de salidas' }

export default async function CalculatorPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { modo, monedas } = await cargarContextoDeMonedas()

  // La imputación del gasto necesita una categoría y una cuenta REALES: sin
  // esto la calculadora sólo podría mandar todo a la categoría por defecto y a
  // la cuenta de la moneda, que es justo lo que el usuario viene a elegir.
  let datos: DatosDeLaCalculadora | null = null

  try {
    const libro = await libroDelServidor(supabase, user.id)
    const [categorias, { cuentas }] = await Promise.all([
      libro.leer('categorias'),
      cargarCuentasYDeudas(libro, monedas),
    ])
    datos = armarDatosDeLaCalculadora(categorias, cuentas, modo)
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  if (!datos) return <CalculadoraEnCliente monedas={monedas} />

  return <VistaCalculadora datos={datos} />
}
