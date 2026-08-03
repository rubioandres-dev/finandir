import { cn } from '@/lib/utils'

/**
 * Superficie base AUREM.
 *
 * `glass` activa el vidrio dorado con destello radial (.glass-card); sin él
 * la card es el charcoal sólido, más sobrio, para listados largos donde el
 * blur repetido pesa y distrae.
 */
export function Card({
  className,
  glass = false,
  ...props
}: React.ComponentProps<'div'> & { glass?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-2xl',
        glass ? 'glass-card' : 'border border-border bg-card',
        className
      )}
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
    <h2
      className={cn('font-display text-sm font-semibold tracking-tight', className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-4', className)} {...props} />
}

/** Rótulo de métrica: versalitas AUREM, mismo tono en toda la app. */
export function CardLabel({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'aurem-caps flex items-center gap-1.5 text-[10px] text-on-surface-variant/75',
        className
      )}
      {...props}
    />
  )
}
