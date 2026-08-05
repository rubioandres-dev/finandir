'use client'

import { useRouter } from 'next/navigation'
import { createContext, useContext, useMemo, useState, useTransition } from 'react'
import { COOKIE_MONEDA, MAX_EDAD_COOKIE_MONEDA } from '@/lib/currency-mode'
import type { Moneda } from '@/lib/types'

type Contexto = {
  /** Moneda activa. Filtra cuentas, movimientos, tarjetas y presupuestos. */
  modo: Moneda
  cambiarModo: (moneda: Moneda) => void
  /** true mientras el servidor recarga las vistas con la moneda nueva. */
  cambiando: boolean
  /**
   * Si se muestran las conversiones aproximadas junto a cada importe.
   *
   * Derivado de `modo`: en USD se muestran, en ARS no. Se mantiene el nombre
   * porque `<Monto>` y sus llamadas ya dependen de él, y el significado es el
   * mismo que antes del modo global.
   */
  mostrarEquivalencias: boolean
}

const MonedaContext = createContext<Contexto | null>(null)

/**
 * Provee la moneda activa de la app.
 *
 * El valor inicial LO DA EL SERVIDOR (`modoInicial`, leído de la cookie), no
 * localStorage. Es lo que evita el parpadeo y el mismatch de hidratación: el
 * HTML ya viene filtrado con la misma moneda con la que arranca el cliente.
 *
 * Al cambiar de moneda se escribe la cookie y se pide `router.refresh()`, que
 * vuelve a ejecutar los Server Components y trae los datos de la otra moneda.
 */
export function CurrencyProvider({
  children,
  modoInicial,
}: {
  children: React.ReactNode
  modoInicial: Moneda
}) {
  const router = useRouter()
  const [modo, setModo] = useState<Moneda>(modoInicial)
  const [cambiando, iniciarCambio] = useTransition()

  const valor = useMemo<Contexto>(
    () => ({
      modo,
      cambiando,
      mostrarEquivalencias: modo === 'USD',
      cambiarModo: (moneda: Moneda) => {
        if (moneda === modo) return

        // `path=/` para que valga en todas las rutas, y `SameSite=Lax` porque
        // es una preferencia de UI, no algo que deba viajar entre sitios.
        document.cookie = `${COOKIE_MONEDA}=${moneda}; path=/; max-age=${MAX_EDAD_COOKIE_MONEDA}; SameSite=Lax`

        // Optimista: el toggle se pinta ya, sin esperar al servidor.
        setModo(moneda)
        iniciarCambio(() => router.refresh())
      },
    }),
    [modo, cambiando, router]
  )

  return <MonedaContext.Provider value={valor}>{children}</MonedaContext.Provider>
}

function useMonedaContext(): Contexto {
  const contexto = useContext(MonedaContext)
  if (!contexto) {
    throw new Error('useModoMoneda debe usarse dentro de <CurrencyProvider>')
  }
  return contexto
}

/** Moneda activa y su setter. */
export function useModoMoneda(): Contexto {
  return useMonedaContext()
}

/**
 * Solo la parte de equivalencias.
 *
 * Se conserva con este nombre y esta forma para no tocar `<Monto>` ni sus
 * llamadas: antes venía de su propio contexto y ahora se deriva del modo.
 */
export function useEquivalencias(): { mostrarEquivalencias: boolean } {
  const { mostrarEquivalencias } = useMonedaContext()
  return { mostrarEquivalencias }
}
