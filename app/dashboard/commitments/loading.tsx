import { CardHueso, FilaHueso, Hueso, SeccionCargando } from '@/components/ui/skeleton'

export default function CargaCompromisos() {
  return (
    <SeccionCargando>
      <Hueso className="h-8 w-64" />

      {/* Curva de desendeudamiento. */}
      <CardHueso className="h-56" />

      {/* Total pasivo futuro + métricas. */}
      <CardHueso className="h-24" />
      <div className="grid grid-cols-2 gap-3">
        <CardHueso className="h-20" />
        <CardHueso className="h-20" />
      </div>

      {/* Planes de cuotas activos. */}
      <Hueso className="h-4 w-48" />
      <div className="flex flex-col gap-2.5">
        <FilaHueso />
        <FilaHueso />
        <FilaHueso />
      </div>
    </SeccionCargando>
  )
}
