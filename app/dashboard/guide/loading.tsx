import { CardHueso, Hueso, SeccionCargando } from '@/components/ui/skeleton'

export default function CargaGuia() {
  return (
    <SeccionCargando>
      <Hueso className="h-8 w-40" />
      <CardHueso className="h-28" />
      <CardHueso className="h-28" />
      <CardHueso className="h-28" />
      <CardHueso className="h-28" />
    </SeccionCargando>
  )
}
