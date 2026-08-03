import { FilaHueso, Hueso, SeccionCargando } from '@/components/ui/skeleton'

export default function CargaMovimientos() {
  return (
    <SeccionCargando>
      <Hueso className="h-8 w-48" />
      <div className="flex gap-2">
        <Hueso className="h-9 w-24 rounded-full" />
        <Hueso className="h-9 w-24 rounded-full" />
        <Hueso className="h-9 w-24 rounded-full" />
      </div>
      <div className="flex flex-col gap-2.5">
        <FilaHueso />
        <FilaHueso />
        <FilaHueso />
        <FilaHueso />
        <FilaHueso />
        <FilaHueso />
      </div>
    </SeccionCargando>
  )
}
