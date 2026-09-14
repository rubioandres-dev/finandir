'use client'

import { CalendarDays } from 'lucide-react'
import { FinancialCalendar } from '@/components/financial-calendar'
import { GuardianDeBoveda } from '@/components/guardian-de-boveda'
import { CargadorEnCliente } from '@/components/vistas/cargador-en-cliente'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { cargarEventosDelMes } from '@/lib/calendar-service'
import type { EventoFinanciero } from '@/lib/calendar-service'

export type DatosDelCalendario = {
  eventos: EventoFinanciero[]
  sinTarjetas: boolean
  error: string | null
}

export function VistaCalendario({
  anio,
  mes,
  hoy,
  datos,
}: {
  anio: number
  mes: number
  hoy: string
  datos: DatosDelCalendario
}) {
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

      {datos.error && (
        <p
          role="alert"
          className="rounded-2xl border border-error-rose/30 bg-error-rose/10 px-4 py-3 text-sm text-error-rose"
        >
          Hubo un problema al cargar los movimientos del mes: {datos.error}
        </p>
      )}

      {datos.sinTarjetas && (
        <p className="rounded-2xl border border-budget-warn/30 bg-budget-warn/10 px-4 py-3 text-sm text-budget-warn">
          Cargá los días de cierre y vencimiento de tus tarjetas en Cuentas para verlos acá.
        </p>
      )}

      <FinancialCalendar anio={anio} mes={mes} hoy={hoy} eventos={datos.eventos} />
    </div>
  )
}

export function CalendarioEnCliente({
  anio,
  mes,
  hoy,
}: {
  anio: number
  mes: number
  hoy: string
}) {
  return (
    <GuardianDeBoveda>
      <CargadorEnCliente
        cargar={async (libro): Promise<DatosDelCalendario> => {
            const { tarjetas } = await cargarCuentasYDeudas(libro)
            const { eventos, error } = await cargarEventosDelMes(libro, tarjetas, anio, mes)
            return { eventos, sinTarjetas: tarjetas.length === 0, error }
          }}
        ver={(datos) => (
            <VistaCalendario anio={anio} mes={mes} hoy={hoy} datos={datos} />
          )}
      />
    </GuardianDeBoveda>
  )
}
