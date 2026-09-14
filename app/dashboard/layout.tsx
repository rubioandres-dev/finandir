import { redirect } from 'next/navigation'
import { CurrencyProvider } from '@/components/currency-provider'
import { FloatingActionButton } from '@/components/floating-action-button'
import { GuidedTourProvider } from '@/components/guided-tour'
import { AppShell } from '@/components/layout/app-shell'
import { OnboardingModal } from '@/components/onboarding-modal'
import { UrlActionHandler } from '@/components/url-action-handler'
import { cargarCuentasYDeudas } from '@/lib/accounts-service'
import {
  backendDelUsuario,
  libroDelServidor,
  ModoCifradoEnServidor,
} from '@/lib/almacen/acceso'
import { ProveedorDeLibro } from '@/components/libro-provider'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { cargarDatosDeCabecera, nivelPara } from '@/lib/header-data'
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
  // Las preferencias no se cifran, asi que el contexto anda en los dos modos.
  const [cotizacion, contexto] = await Promise.all([
    obtenerCotizacionDelDia(supabase),
    cargarContextoDeMonedas(),
  ])

  /**
   * EL LAYOUT NO PUEDE CAERSE, NUNCA.
   *
   * Envuelve a TODO el dashboard, Ajustes incluido — que es donde vive el
   * interruptor para volver a modo Estandar. Si se cayera porque el servidor no
   * puede leer los datos, un usuario en Boveda no tendria por donde salir y el
   * modo seria exactamente la trampa que dijimos que no iba a ser.
   *
   * Asi que degrada: sin tarjetas el header no muestra avisos de vencimiento y
   * el FAB ofrece menos categorias, pero la navegacion, el idioma y Ajustes
   * siguen en pie.
   */
  let tarjetas: Awaited<ReturnType<typeof cargarCuentasYDeudas>>['tarjetas'] = []
  let cuentas: Awaited<ReturnType<typeof cargarCuentasYDeudas>>['cuentas'] = []
  let categoriasDelFab: { nombre: string; tipo: 'INCOME' | 'EXPENSE' }[] = []
  const backend = await backendDelUsuario(supabase, user.id)
  let cabecera: Awaited<ReturnType<typeof cargarDatosDeCabecera>> = {
    // `null` y no `0`: no sabemos la tasa de ahorro, que no es lo mismo que
    // decir que es cero.
    nivel: nivelPara(null),
    avisos: [],
  }

  try {
    const libro = await libroDelServidor(supabase, user.id)
    const deCuentas = await cargarCuentasYDeudas(libro)
    tarjetas = deCuentas.tarjetas
    cuentas = deCuentas.cuentas

    // Nombre y tipo: es lo que necesitan los dos modales del FAB. El escáner
    // usa los nombres para que la IA elija de las categorías reales del
    // usuario, y la carga rápida necesita el tipo para filtrar el select
    // según sea gasto o ingreso.
    categoriasDelFab = (await libro.leer('categorias')).map((c) => ({
      nombre: c.name,
      tipo: c.type,
    }))

    // ADENTRO del try a propósito. Pasarle el libro relacional cuando el
    // cifrado no se puede leer resolvería el nivel y los avisos leyendo las
    // tablas viejas, que para un usuario en Bóveda TODAVÍA tienen sus datos
    // —no se borran hasta la limpieza final—. Sería exactamente la fuga que el
    // modo existe para evitar, y de las que no se notan mirando la pantalla.
    cabecera = await cargarDatosDeCabecera(libro, tarjetas, hoyEnArgentina())
  } catch (error) {
    if (!(error instanceof ModoCifradoEnServidor)) throw error
  }

  const { nivel, avisos } = cabecera

  const nombreDeMetadata =
    typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name
      ? user.user_metadata.full_name
      : null

  // El onboarding solo aparece si además se PUEDE guardar: sin la 007 el modal
  // sería una pared, porque no hay tabla donde escribir la respuesta.
  const mostrarOnboarding =
    !contexto.faltaMigracion && contexto.perfil?.onboarding_completed !== true

  /**
   * UN SOLO PROVEEDOR PARA TODA LA APP.
   *
   * Antes lo montaba cada pantalla, y eso significaba un libro por pantalla:
   * cada navegacion tiraba el cache y volvia a bajar los mismos bloques. Aca
   * arriba el libro sobrevive a moverse entre secciones.
   *
   * En modo Estandar no se monta: no hay clave que recuperar ni sobre que
   * leer, y montarlo seria pagar dos consultas por nada.
   */
  const conLibro = (hijos: React.ReactNode) =>
    backend === 'SUPABASE' ? hijos : <ProveedorDeLibro>{hijos}</ProveedorDeLibro>

  return conLibro(
    <CurrencyProvider
      modoInicial={contexto.modo}
      monedas={contexto.monedas}
      locale={contexto.locale}
      idioma={contexto.idioma}
      modulos={contexto.modulos}
      backend={backend}
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
