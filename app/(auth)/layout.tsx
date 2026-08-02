export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-emerald-600 text-lg font-bold text-white">
          F
        </span>
        <span className="text-lg font-semibold tracking-tight">Finandir</span>
      </div>
      {children}
    </div>
  )
}
