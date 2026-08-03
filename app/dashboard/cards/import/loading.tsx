import { CardHueso, Hueso, SeccionCargando } from '@/components/ui/skeleton'

export default function CargaImportador() {
  return (
    <SeccionCargando>
      <Hueso className="h-8 w-56" />
      {/* Zona de arrastre del resumen. */}
      <CardHueso className="h-52" />
      <CardHueso className="h-24" />
    </SeccionCargando>
  )
}
