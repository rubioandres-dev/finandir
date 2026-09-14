import Link from 'next/link'
import { Lock } from 'lucide-react'

/**
 * Por qué los gastos compartidos piden modo Bóveda.
 *
 * No es una restricción comercial ni una etapa de rollout: un grupo necesita
 * filas que varias cuentas puedan leer y escribir, y que nosotros NO podamos
 * leer. Eso sólo se resuelve con una llave del grupo, y una llave de grupo se
 * abre con la llave personal, que en modo Estándar no existe.
 *
 * Se explica en vez de esconder la sección: un menú que pierde una opción sin
 * decir por qué se lee como un error de la app.
 */
export function CompartidosSoloBoveda() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gold-leaf/40 bg-gold-leaf/5 p-4">
      <div className="flex items-center gap-2">
        <Lock className="size-4 shrink-0 text-gold-leaf" aria-hidden />
        <h1 className="font-display text-base font-bold tracking-tight text-on-background">
          Los gastos compartidos necesitan la Bóveda
        </h1>
      </div>

      <p className="text-sm leading-snug text-on-surface-variant">
        Un grupo guarda gastos que varias personas tienen que poder leer y que nosotros no. Eso se
        hace con una llave del grupo, que se abre con tu llave personal — y esa llave sólo existe
        en modo Bóveda.
      </p>

      <p className="text-[11px] leading-snug text-subtle">
        Cuando actives la Bóveda, tus grupos aparecen de nuevo con todo lo que tenían.
      </p>

      <Link
        href="/dashboard/settings#guardado"
        className="fire-gradient glow-gold flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95"
      >
        Activar la Bóveda
      </Link>
    </div>
  )
}
