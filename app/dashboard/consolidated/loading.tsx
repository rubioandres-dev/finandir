import { CardHueso, Hueso, SeccionCargando } from '@/components/ui/skeleton'

export default function CargaConsolidado() {
  return (
    <SeccionCargando>
      <Hueso className="h-8 w-56" />
      <CardHueso className="h-40" />
      <div className="grid gap-3 sm:grid-cols-2">
        <CardHueso className="h-64" />
        <CardHueso className="h-64" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <CardHueso className="h-24" />
        <CardHueso className="h-24" />
      </div>
    </SeccionCargando>
  )
}
