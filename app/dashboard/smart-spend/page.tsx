import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { GastoInteligenteEnCliente, VistaGastoInteligente } from '@/components/vistas/vista-gasto-inteligente'
import { deudaPorTarjetaDe, type DatosDelGastoInteligente } from '@/components/vistas/datos-gasto-inteligente'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { cargarInversiones } from '@/lib/investments-service'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Gasto inteligente' }

/** El primer valor si el parámetro vino repetido; null si no vino. */
function primerValor(valor: string | string[] | undefined): string | null {
  if (Array.isArray(valor)) return valor[0] ?? null
  return valor ?? null
}

export default async function SmartSpendPage({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>
}) {
  // El Smart Input llega con ?precio y ?moneda del borrador que se estaba
  // cargando, así se pasa de "lo estoy registrando" a "cómo lo pago" sin
  // volver a tipear el importe.
  const parametros = await searchParams
  const precioCrudo = Number(primerValor(parametros.precio))
  const precioInicial = Number.isFinite(precioCrudo) && precioCrudo > 0 ? precioCrudo : null
  const monedaInicial = primerValor(parametros.moneda) === 'USD' ? 'USD' : 'ARS'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { monedas } = await cargarContextoDeMonedas()

  let datos: DatosDelGastoInteligente | null = null

  try {
    const libro = await libroDelServidor(supabase, user.id)
    const [{ tarjetas, cuentas }, { inversiones, resumen }] = await Promise.all([
      cargarCuentasYDeudas(libro, monedas),
      cargarInversiones(libro, monedas),
    ])
    datos = {
      tarjetas,
      deudaPorTarjeta: deudaPorTarjetaDe(cuentas),
      tnaLiquida: resumen.tnaLiquida,
      inversiones,
    }
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  if (!datos) {
    return (
      <GastoInteligenteEnCliente
        monedas={monedas}
        precioInicial={precioInicial}
        monedaInicial={monedaInicial}
      />
    )
  }

  return (
    <VistaGastoInteligente
      datos={datos}
      precioInicial={precioInicial}
      monedaInicial={monedaInicial}
    />
  )
}
