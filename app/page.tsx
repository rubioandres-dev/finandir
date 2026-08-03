import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BrandSplash } from '@/components/brand-splash'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  return (
    <BrandSplash modo="portada">
      <Link
        href="/login"
        className="btn-gold rounded-lg px-4 py-3 text-center font-display text-sm font-bold uppercase tracking-wider"
      >
        Iniciar sesión
      </Link>
      <Link
        href="/signup"
        className="rounded-lg border border-glass-stroke px-4 py-3 text-center font-display text-sm font-bold uppercase tracking-wider text-gold-leaf transition hover:border-gold-leaf/60 hover:bg-gold-leaf/5"
      >
        Crear cuenta
      </Link>
    </BrandSplash>
  )
}
