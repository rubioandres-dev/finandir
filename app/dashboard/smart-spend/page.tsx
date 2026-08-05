import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PiggyBank } from 'lucide-react'
import { SmartSpendCalculator } from '@/components/smart-spend-calculator'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
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

  // El contexto se resuelve acá una sola vez; la calculadora recalcula sola en
  // el cliente con cada tecla, sin volver al servidor.
  const [{ tarjetas, cuentas }, { inversiones, resumen }] = await Promise.all([
    cargarCuentasYDeudas(supabase),
    cargarInversiones(supabase),
  ])

  const deudaPorTarjeta = Object.fromEntries(
    cuentas
      .filter((c) => c.type === 'CREDIT_CARD')
      .map((c) => [c.id, Math.max(0, -Number(c.balance ?? 0))])
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-lg font-bold tracking-tight text-on-background">
          ¿Cómo conviene pagar?
        </h1>
        <p className="text-xs leading-snug text-subtle">
          Compara el descuento por pagar contado contra lo que rinde tu plata mientras financiás.
          Todo llevado a valor de hoy.
        </p>
      </div>

      <SmartSpendCalculator
        tarjetas={tarjetas}
        deudaPorTarjeta={deudaPorTarjeta}
        tnaLiquida={resumen.tnaLiquida}
        precioInicial={precioInicial}
        monedaInicial={monedaInicial}
      />

      {inversiones.length === 0 && (
        <Link
          href="/dashboard/investments"
          className="flex items-center gap-2.5 rounded-2xl border border-dashed border-border p-3.5 transition hover:border-primary/40"
        >
          <PiggyBank className="size-4 shrink-0 text-gold-leaf" aria-hidden />
          <span className="min-w-0 flex-1 text-sm font-medium tracking-tight">
            Cargá tus inversiones
          </span>
          <span className="shrink-0 text-[11px] text-subtle">para usar tu tasa real</span>
        </Link>
      )}
    </div>
  )
}
