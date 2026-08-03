import { CardHueso, Hueso, SeccionCargando } from '@/components/ui/skeleton'

export default function CargaFire() {
  return (
    <SeccionCargando>
      {/* Estado FIRE. */}
      <CardHueso className="h-48" />

      {/* Conversación con el coach. */}
      <div className="flex flex-col gap-3">
        <Hueso className="h-16 w-4/5 rounded-2xl" />
        <Hueso className="ml-auto h-12 w-3/5 rounded-2xl" />
        <Hueso className="h-20 w-4/5 rounded-2xl" />
      </div>
    </SeccionCargando>
  )
}
