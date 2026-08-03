import { CardHueso, Hueso, SeccionCargando } from '@/components/ui/skeleton'

export default function CargaAjustes() {
  return (
    <SeccionCargando>
      <Hueso className="h-8 w-40" />
      <CardHueso className="h-24" />
      <CardHueso className="h-24" />
      <CardHueso className="h-36" />
    </SeccionCargando>
  )
}
