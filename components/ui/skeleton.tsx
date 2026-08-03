/**
 * Bloques de esqueleto AUREM para los loading.tsx de cada sección: pulso
 * suave sobre charcoal, mismos radios y bordes de vidrio que las cards
 * reales para que el reemplazo no "salte" al llegar el contenido.
 */

export function Hueso({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-charcoal/80 ${className}`} />
}

export function CardHueso({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-2xl border border-glass-stroke/30 bg-charcoal/50 ${className}`}
    />
  )
}

/** Fila de listado (ícono + dos líneas + monto), como en movimientos y cuentas. */
export function FilaHueso() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-glass-stroke/20 bg-charcoal/40 px-4 py-3.5">
      <Hueso className="size-9 rounded-xl" />
      <div className="flex flex-1 flex-col gap-2">
        <Hueso className="h-3 w-2/5" />
        <Hueso className="h-2.5 w-1/4" />
      </div>
      <Hueso className="h-3.5 w-16" />
    </div>
  )
}

/** Envoltorio con el aria correcto: una sola región viva, no cien divs. */
export function SeccionCargando({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-label="Cargando sección" className="flex flex-col gap-5">
      {children}
    </div>
  )
}
