import { CardHueso, FilaHueso, Hueso, SeccionCargando } from '@/components/ui/skeleton'

export default function CargaInversiones() {
  return (
    <SeccionCargando>
      <Hueso className="h-8 w-40" />
      <CardHueso className="h-36" />
      <div className="grid grid-cols-2 gap-3">
        <CardHueso className="h-24" />
        <CardHueso className="h-24" />
      </div>
      <CardHueso className="h-24" />
      <div className="flex flex-col gap-2.5">
        <FilaHueso />
        <FilaHueso />
        <FilaHueso />
      </div>
    </SeccionCargando>
  )
}
