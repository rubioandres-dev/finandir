import { CardHueso, Hueso, SeccionCargando } from '@/components/ui/skeleton'

export default function CargaGastoInteligente() {
  return (
    <SeccionCargando>
      <Hueso className="h-8 w-56" />
      <div className="grid gap-4 lg:grid-cols-2">
        <CardHueso className="h-80" />
        <CardHueso className="h-80" />
      </div>
    </SeccionCargando>
  )
}
