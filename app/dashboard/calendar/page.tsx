import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import {
  CalendarioEnCliente,
  VistaCalendario,
  type DatosDelCalendario,
} from '@/components/vistas/vista-calendario'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { libroDelServidor, ModoCifradoEnServidor } from '@/lib/almacen/acceso'
import { cargarEventosDelMes } from '@/lib/calendar-service'
import { createClient } from '@/lib/supabase/server'
import { hoyEnArgentina } from '@/lib/types'

export const metadata: Metadata = { title: 'Calendario' }

/** Lee ?m=YYYY-MM; cualquier cosa rara cae en el mes actual. */
function mesPedido(valor: string | undefined, hoy: string): [number, number] {
  const [anioHoy, mesHoy] = hoy.split('-').map(Number)
  if (!valor || !/^\d{4}-\d{2}$/.test(valor)) return [anioHoy, mesHoy]

  const [anio, mes] = valor.split('-').map(Number)
  if (mes < 1 || mes > 12 || anio < 2000 || anio > 2100) return [anioHoy, mesHoy]
  return [anio, mes]
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const hoy = hoyEnArgentina()
  const [anio, mes] = mesPedido((await searchParams).m, hoy)

  let datos: DatosDelCalendario | null = null

  try {
    const libro = await libroDelServidor(supabase, user.id)
    const { tarjetas } = await cargarCuentasYDeudas(libro)
    const { eventos, error } = await cargarEventosDelMes(libro, tarjetas, anio, mes)
    datos = { eventos, sinTarjetas: tarjetas.length === 0, error }
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  if (!datos) return <CalendarioEnCliente anio={anio} mes={mes} hoy={hoy} />

  return <VistaCalendario anio={anio} mes={mes} hoy={hoy} datos={datos} />
}
