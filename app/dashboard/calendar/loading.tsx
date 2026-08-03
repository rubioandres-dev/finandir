import { CardHueso, FilaHueso, Hueso, SeccionCargando } from '@/components/ui/skeleton'

export default function CargaCalendario() {
  return (
    <SeccionCargando>
      <Hueso className="h-8 w-52" />

      {/* Grilla del mes. */}
      <CardHueso className="h-80" />

      {/* Detalle del día seleccionado. */}
      <Hueso className="h-4 w-56" />
      <div className="flex flex-col gap-2.5">
        <FilaHueso />
        <FilaHueso />
      </div>
    </SeccionCargando>
  )
}
