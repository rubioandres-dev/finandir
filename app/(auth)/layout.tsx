export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <span className="fire-gradient glow-gold grid size-9 place-items-center rounded-xl font-display text-lg font-extrabold text-midnight-navy">
          A
        </span>
        <span className="font-display text-lg font-extrabold uppercase tracking-tighter text-gold-leaf">
          Aurem
        </span>
      </div>
      {children}
    </div>
  )
}
