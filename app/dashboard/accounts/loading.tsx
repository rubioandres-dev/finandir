import { CardHueso, FilaHueso, Hueso, SeccionCargando } from '@/components/ui/skeleton'

export default function CargaCuentas() {
  return (
    <SeccionCargando>
      {/* Patrimonio neto. */}
      <CardHueso className="h-40" />

      {/* Cuentas y billeteras. */}
      <Hueso className="h-4 w-44" />
      <div className="flex flex-col gap-2.5">
        <FilaHueso />
        <FilaHueso />
        <FilaHueso />
      </div>

      {/* Tarjetas de crédito. */}
      <Hueso className="h-4 w-40" />
      <div className="flex gap-3 overflow-hidden">
        <CardHueso className="h-36 w-64 shrink-0" />
        <CardHueso className="h-36 w-64 shrink-0" />
      </div>
    </SeccionCargando>
  )
}
