import { cn } from '@/lib/utils'

/** Superficie base del sistema: borde sutil, esquinas suaves, sin sombra dura. */
export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-2xl border border-border bg-card', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-4 pt-4', className)} {...props} />
  )
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2 className={cn('text-sm font-semibold tracking-tight', className)} {...props} />
  )
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-4', className)} {...props} />
}

/** Rótulo de métrica: mayúsculas chicas, mismo tono en toda la app. */
export function CardLabel({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle',
        className
      )}
      {...props}
    />
  )
}
