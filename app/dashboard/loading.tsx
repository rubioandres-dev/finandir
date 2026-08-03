import { CardHueso, FilaHueso, Hueso, SeccionCargando } from '@/components/ui/skeleton'

export default function CargaInicio() {
  return (
    <SeccionCargando>
      {/* Card de balance total. */}
      <CardHueso className="h-44" />

      {/* Acciones rápidas. */}
      <div className="grid grid-cols-4 gap-3">
        <CardHueso className="h-20" />
        <CardHueso className="h-20" />
        <CardHueso className="h-20" />
        <CardHueso className="h-20" />
      </div>

      {/* Últimos movimientos. */}
      <Hueso className="h-4 w-36" />
      <div className="flex flex-col gap-2.5">
        <FilaHueso />
        <FilaHueso />
        <FilaHueso />
        <FilaHueso />
      </div>
    </SeccionCargando>
  )
}
