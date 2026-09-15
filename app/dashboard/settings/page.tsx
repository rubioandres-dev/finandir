import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'
import { CurrencySettings } from '@/components/currency-settings'
import { LanguageSettings } from '@/components/language-settings'
import { ModuleSettings } from '@/components/module-settings'
import { PrivacySettings } from '@/components/privacy-settings'
import { StorageSettings } from '@/components/storage-settings'
import { RegionSettings } from '@/components/region-settings'
import { SettingsDraftProvider } from '@/components/settings-draft'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { cargarContextoDeMonedas } from '@/lib/currency-mode-server'
import { crearTraductor } from '@/lib/i18n'
import { obtenerCotizacionDelDia } from '@/lib/rates'
import { createClient } from '@/lib/supabase/server'
import { formatoMoneda } from '@/lib/types'
import { backendDelUsuario } from '@/lib/almacen/acceso'

export const metadata: Metadata = { title: 'Configuración' }

/**
 * CONFIGURACIÓN — cómo se comporta la app
 * =============================================================================
 *
 * Acá estaba TODO: los datos personales, la contraseña, las preferencias y los
 * presupuestos por categoría. Eran cuatro cosas con públicos y frecuencias
 * distintas amontonadas en una pantalla larga, y encontrar cualquiera costaba.
 *
 * Quedó partida en tres: Perfil (quién sos), Presupuestos (tu plata) y esto
 * —divisas, región, idioma, módulos, privacidad y dónde se guardan los datos—.
 *
 * LA RUTA NO CAMBIA
 *
 * Sigue siendo `/dashboard/settings` aunque la sección se llame Configuración:
 * hay enlaces viejos, un ancla `#guardado` al que manda el onboarding, y
 * romperlos para que la URL haga juego con el título no le sirve a nadie.
 *
 * Y TIENE QUE ABRIR SIEMPRE
 *
 * Es donde vive el interruptor para volver a modo Estándar. Si se cayera porque
 * el servidor no puede leer los datos, alguien en Bóveda no tendría por dónde
 * salir. Por eso acá adentro no se lee ni un movimiento: lo único que se
 * consulta es el perfil, que se queda en claro en todos los modos.
 */
export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Configuración muestra TODAS las divisas del perfil, no solo la activa: es
  // donde se administran, así que filtrarlas por el modo del header sería
  // absurdo.
  const {
    monedas,
    locale,
    idioma,
    modulos,
    faltaMigracion: faltaPerfil,
  } = await cargarContextoDeMonedas()
  const tr = crearTraductor(idioma)

  const backend = await backendDelUsuario(supabase, user.id)
  const cotizacion = await obtenerCotizacionDelDia(supabase)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-on-background">
        <SlidersHorizontal className="size-5 text-gold-leaf" aria-hidden />
        {tr('nav.configuracion')}
      </h1>

      {/* Las divisas siguen guardando al toque: cambiarlas altera la lista del
          selector del header, y dejarlas en un borrador sin confirmar mostraría
          un header ofreciendo divisas que el servidor no conoce. */}
      <CurrencySettings monedasIniciales={monedas} faltaMigracion={faltaPerfil} />

      {/* Región, idioma y módulos comparten un solo borrador y una sola
          escritura: los tres reconstruyen el layout entero, y hacerlo una vez
          por toque era el origen del parpadeo. */}
      <SettingsDraftProvider
        inicial={{ locale, idioma, modulos }}
        faltaMigracion={faltaPerfil}
      >
        <RegionSettings />
        <LanguageSettings />
        <ModuleSettings />
      </SettingsDraftProvider>

      {/* Fuera del borrador a propósito: vive en una cookie de este
          dispositivo, no en el perfil, y guarda al toque. */}
      <PrivacySettings />

      {/* Corre entero en el navegador: la contraseña deriva la clave, y esa
          clave es de lo que el modo protege al servidor. */}
      <StorageSettings backend={backend} />

      <Card>
        <CardContent className="flex flex-col gap-3">
          <CardLabel>{tr('ajustes.cotizacion')}</CardLabel>
          {cotizacion ? (
            <>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {formatoMoneda.format(cotizacion.venta)}
              </p>
              <p className="text-xs text-subtle">
                Dólar MEP · {cotizacion.fuente} ·{' '}
                {cotizacion.cacheada ? 'guardada' : 'en vivo, sin guardar'}
              </p>
              {!cotizacion.cacheada && (
                <p className="rounded-xl border border-budget-warn/30 bg-budget-warn/10 px-3 py-2 text-xs text-budget-warn">
                  No se está guardando el histórico de cotizaciones. Ejecutá{' '}
                  <code className="font-mono">migrations/002_multi_moneda.sql</code> para habilitar
                  la escritura en <code className="font-mono">exchange_rates</code>.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-subtle">{tr('ajustes.sinCotizacion')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
