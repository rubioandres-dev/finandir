import { CardHueso, FilaHueso, Hueso, SeccionCargando } from '@/components/ui/skeleton'

export default function CargaDeudas() {
  return (
    <SeccionCargando>
      <Hueso className="h-8 w-44" />
      <CardHueso className="h-28" />
      <div className="flex flex-col gap-2.5">
        <FilaHueso />
        <FilaHueso />
        <FilaHueso />
      </div>
    </SeccionCargando>
  )
}
