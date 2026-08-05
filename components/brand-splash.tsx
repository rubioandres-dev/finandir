import { Award, Gem, ShieldCheck } from 'lucide-react'

type Props = {
  /**
   * `portada`: pantalla de bienvenida; la barra queda fija como en la pieza
   * de identidad y el slot `children` recibe las acciones (login/signup).
   * `carga`: pantalla de espera; la barra respira en loop.
   */
  modo: 'portada' | 'carga'
  children?: React.ReactNode
}

/**
 * Pieza de identidad AUREM a pantalla completa. Es a la vez la portada para
 * visitantes anónimos y la cortina de carga tras el login: que ambas sean el
 * mismo componente hace que la transición se sienta continua.
 */
export function BrandSplash({ modo, children }: Props) {
  return (
    // `dark` fuerza la paleta noir en este subárbol aunque el tema activo sea
    // el claro: la pieza de identidad es noir por definición —igual que el
    // ícono y el background_color del manifest— y sus textos son crema sobre
    // navy. Sin esto, en tema claro el texto se volvería carbón sobre navy.
    <div className="dark relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-hidden bg-midnight-navy px-8">
      {/* Órbitas decorativas de la esquina, como en la pieza de marca. */}
      <div
        aria-hidden
        className="absolute -left-44 -top-44 size-[420px] rounded-full border border-glass-stroke/30"
      />
      <div
        aria-hidden
        className="absolute -left-24 -top-24 size-[260px] rounded-full border border-glass-stroke/20"
      />
      <div
        aria-hidden
        className="absolute -bottom-64 -right-48 size-[560px] rounded-full border border-gold-leaf/10"
      />

      <div className="flex w-full max-w-xs flex-col items-center">
        <h1 className="font-display text-5xl font-extrabold tracking-tight">
          <span className="text-gold-leaf">A</span>
          <span className="text-on-background">UREM</span>
        </h1>

        <div className="mt-10 w-full">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="aurem-caps text-[11px] text-on-background">Excellence</span>
            <span className="text-[11px] font-medium tabular-nums text-on-surface-variant/70">
              {modo === 'carga' ? 'Cargando…' : '30%'}
            </span>
          </div>
          <div
            role={modo === 'carga' ? 'progressbar' : undefined}
            aria-label={modo === 'carga' ? 'Cargando' : undefined}
            className="h-0.5 w-full overflow-hidden rounded-full bg-charcoal"
          >
            <div
              className={`fire-gradient glow-gold h-full rounded-full ${
                modo === 'carga' ? 'splash-bar-activa' : 'w-[30%]'
              }`}
            />
          </div>
        </div>

        {children ? (
          <div className="mt-12 flex w-full flex-col gap-3">{children}</div>
        ) : (
          <div aria-hidden className="mt-12 h-16 w-px bg-glass-stroke/40" />
        )}
      </div>

      <div className="absolute inset-x-0 bottom-10 flex flex-col items-center gap-3">
        <span className="aurem-caps text-[10px] text-on-surface-variant/50">
          Premium Standards
        </span>
        <div className="flex items-center gap-4 text-gold-leaf/50">
          <Gem className="size-3.5" aria-hidden />
          <ShieldCheck className="size-3.5" aria-hidden />
          <Award className="size-3.5" aria-hidden />
        </div>
      </div>
    </div>
  )
}
