import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { FinancialCalendar } from '@/components/financial-calendar'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
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

  const { tarjetas } = await cargarCuentasYDeudas(supabase)
  const { eventos, error } = await cargarEventosDelMes(supabase, tarjetas, anio, mes)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-on-background">
          <CalendarDays className="size-5 text-gold-leaf" aria-hidden />
          Calendario financiero
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Cuándo cierra cada tarjeta, cuándo vence cada resumen y cuándo entra la plata.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-error-rose/30 bg-error-rose/10 px-4 py-3 text-sm text-error-rose"
        >
          Hubo un problema al cargar los movimientos del mes: {error}
        </p>
      )}

      {tarjetas.length === 0 && (
        <p className="rounded-2xl border border-budget-warn/30 bg-budget-warn/10 px-4 py-3 text-sm text-budget-warn">
          Cargá los días de cierre y vencimiento de tus tarjetas en Cuentas para verlos acá.
        </p>
      )}

      <FinancialCalendar anio={anio} mes={mes} hoy={hoy} eventos={eventos} />
    </div>
  )
}
