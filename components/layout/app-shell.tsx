'use client'

import { useCallback, useState } from 'react'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Header } from '@/components/layout/header'
import { MoreMenuDrawer } from '@/components/layout/more-menu-drawer'
import { Sidebar, SidebarInset, SidebarProvider } from '@/components/layout/sidebar'
import type { Aviso } from '@/lib/header-data'

/**
 * El armazón de la app: header, barra lateral, contenido y barra inferior.
 *
 * POR QUÉ EXISTE ESTE COMPONENTE
 *
 * El layout del dashboard es un Server Component —lee la sesión, el perfil y las
 * cuentas— y dos cosas del armazón necesitan estado de cliente: si la barra
 * lateral está plegada y si la bandeja "Más" está abierta. Envolver acá es más
 * barato que subir todo el layout al cliente y perder el render en servidor de
 * lo que sí puede quedarse ahí.
 *
 * LA BANDEJA "MÁS" VIVE ACÁ, NO EN LA BARRA INFERIOR
 *
 * La abre un solo control —la pestaña "Más"—, pero el estado se queda en el
 * shell: el diálogo se monta como hermano de la barra, no adentro, así que el
 * portal no hereda el `backdrop-blur` ni el z-index de la barra inferior.
 */
export function AppShell({
  email,
  nombre,
  cotizacion,
  avisos,
  xp = 0,
  tasaDeAhorro = null,
  children,
}: {
  email: string
  nombre: string | null
  cotizacion: number | null
  avisos: Aviso[]
  /** Puntos AUREM acumulados. Definen el tier que muestra la barra lateral. */
  xp?: number
  /** El "% ahorrado" que antes iba en la sub-barra del header. */
  tasaDeAhorro?: number | null
  children: React.ReactNode
}) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const abrirMenu = useCallback(() => setMenuAbierto(true), [])
  const cerrarMenu = useCallback(() => setMenuAbierto(false), [])

  return (
    <SidebarProvider>
      <Header email={email} nombre={nombre} cotizacion={cotizacion} avisos={avisos} />

      {/* La barra lateral es `fixed`, así que no ocupa lugar en el flujo: el
          desplazamiento del contenido lo pone `SidebarInset`. */}
      <Sidebar xp={xp} tasaDeAhorro={tasaDeAhorro} />

      <SidebarInset>
        {/* pb-28 en mobile deja lugar para la barra inferior flotante.
            La canaleta horizontal la pone `safe-x`, que ya combina la base con
            el inset del notch: un `px-4` acá volvería a pisarla. */}
        <main className="safe-x mx-auto w-full max-w-2xl flex-1 pb-28 pt-5 lg:pb-12">
          {children}
        </main>
      </SidebarInset>

      <BottomNav menuAbierto={menuAbierto} onAbrirMenu={abrirMenu} />

      {menuAbierto && <MoreMenuDrawer onCerrar={cerrarMenu} xp={xp} />}
    </SidebarProvider>
  )
}
