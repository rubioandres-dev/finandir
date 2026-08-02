import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FileScan } from 'lucide-react'
import { StatementImporter } from '@/components/statement-importer'
import { obtenerCuentasPorMoneda } from '@/lib/finanzas'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Importar resumen' }

export default async function ImportStatementPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { cuentas } = await obtenerCuentasPorMoneda(supabase)
  const tarjetas = Object.values(cuentas)
    .filter((c) => c.type === 'CREDIT_CARD')
    .map((c) => ({ id: c.id, name: c.name, type: c.type, currency: c.currency }))

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <FileScan className="size-5 text-primary" aria-hidden />
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
