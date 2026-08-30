import { redirect } from 'next/navigation'
import { CurrencyProvider } from '@/components/currency-provider'
import { FloatingActionButton } from '@/components/floating-action-button'
import { GuidedTourProvider } from '@/components/guided-tour'
import { AppShell } from '@/components/layout/app-shell'
import { OnboardingModal } from '@/components/onboarding-modal'
import { UrlActionHandler } from '@/components/url-action-handler'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { cargarDatosDeCabecera } from '@/lib/header-data'
import { obtenerCotizacionDelDia } from '@/lib/rates'
import { createClient } from '@/lib/supabase/server'
import { hoyEnArgentina } from '@/lib/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // La moneda activa sale de la cookie ACOTADA a las divisas del perfil, así
  // el HTML ya viene filtrado y el cliente arranca con el mismo valor: sin
  // parpadeo ni mismatch. `cargarContextoDeMonedas` está memoizado por
  // request, así que las páginas de abajo lo vuelven a pedir sin costo.
  const [cotizacion, { tarjetas, cuentas }, contexto, resCategorias] = await Promise.all([
    obtenerCotizacionDelDia(supabase),
    cargarCuentasYDeudas(supabase),
    cargarContextoDeMonedas(),
    // Nombre y tipo: es lo que necesitan los dos modales del FAB. El escáner
    // usa los nombres para que la IA elija de las categorías reales del
    // usuario, y la carga rápida necesita el tipo para filtrar el select
    // según sea gasto o ingreso.
    supabase.from('categories').select('name, type').order('name'),
  ])

  const categoriasDelFab = (resCategorias.data ?? []).map((c) => ({
    nombre: c.name as string,
    tipo: c.type as 'INCOME' | 'EXPENSE',
  }))

  const { nivel, avisos } = await cargarDatosDeCabecera(supabase, tarjetas, hoyEnArgentina())

  const nombreDeMetadata =
    typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name
      ? user.user_metadata.full_name
      : null

  // El onboarding solo aparece si además se PUEDE guardar: sin la 007 el modal
  // sería una pared, porque no hay tabla donde escribir la respuesta.
  const mostrarOnboarding =
    !contexto.faltaMigracion && contexto.perfil?.onboarding_completed !== true

  return (
    <CurrencyProvider
      modoInicial={contexto.modo}
      monedas={contexto.monedas}
      locale={contexto.locale}
      idioma={contexto.idioma}
      modulos={contexto.modulos}
      ocultoInicial={contexto.oculto}
      ocultoPorDefecto={contexto.ocultoPorDefecto}
    >
      {/* El tour arranca solo la primera vez, pero NO durante el onboarding:
          dos capas modales encimadas dejan al usuario sin saber cuál cerrar.
          Que ya se haya visto lo decide `localStorage`, del lado del cliente. */}
      <GuidedTourProvider arrancarSolo={!mostrarOnboarding}>
        <AppShell
          email={user.email ?? ''}
          // El nombre sale del perfil y cae a `user_metadata`, que es donde
          // vivía antes de la 007 y donde lo siguen escribiendo las actions.
          nombre={contexto.perfil?.display_name ?? nombreDeMetadata}
          cotizacion={cotizacion?.venta ?? null}
          avisos={avisos}
          xp={contexto.xp}
          tasaDeAhorro={nivel.tasaDeAhorro}
        >
          {children}
        </AppShell>

      {/* Atajos de la PWA: traduce ?action= en una acción del botón flotante.
          Va afuera del `!mostrarOnboarding` porque no pinta nada: si el modal
          de onboarding está arriba, la acción queda pendiente y el FAB la
          levanta cuando monta. */}
      <UrlActionHandler />

      {/* Fuera del <div> del layout y no adentro del <main>: es `fixed` y no
          tiene que competir con el scroll ni con el ancho máximo del contenido.
          No se muestra durante el onboarding, que es modal y obligatorio. */}
      {!mostrarOnboarding && (
        <FloatingActionButton
          categorias={categoriasDelFab}
          cuentas={cuentas.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            currency: c.currency,
          }))}
        />
      )}

      {mostrarOnboarding && (
        <OnboardingModal
          nombreInicial={contexto.perfil?.display_name ?? nombreDeMetadata}
          monedasIniciales={contexto.monedas}
          localeInicial={contexto.locale}
        />
      )}
      </GuidedTourProvider>
    </CurrencyProvider>
  )
}
