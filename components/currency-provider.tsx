'use client'

import { useRouter } from 'next/navigation'
import { createContext, useContext, useMemo, useState, useTransition } from 'react'
import { COOKIE_MONEDA, MAX_EDAD_COOKIE_MONEDA } from '@/lib/currency-mode'
import { MONEDAS_POR_DEFECTO } from '@/lib/monedas'
import type { Moneda } from '@/lib/types'

type Contexto = {
  /** Moneda activa. Filtra cuentas, movimientos, tarjetas y presupuestos. */
  modo: Moneda
  cambiarModo: (moneda: Moneda) => void
  /** Divisas que el usuario eligió en el onboarding. La primera es la principal. */
  monedasSeleccionadas: Moneda[]
  /** true mientras el servidor recarga las vistas con la moneda nueva. */
  cambiando: boolean
  /**
   * Si se muestran las conversiones aproximadas junto a cada importe.
   *
   * Derivado de `modo`: en USD se muestran, en el resto no. Sigue atado al par
   * ARS/USD porque la equivalencia que la app guarda por movimiento
   * (`amount_usd`) es esa; para el resto de las divisas la conversión vive en
   * el consolidado, con su cotización a la vista.
   */
  mostrarEquivalencias: boolean
}

const MonedaContext = createContext<Contexto | null>(null)

/**
 * Provee la moneda activa de la app y la lista de divisas del usuario.
 *
 * Los dos valores iniciales LOS DA EL SERVIDOR (`modoInicial` de la cookie,
 * `monedas` del perfil), no localStorage. Es lo que evita el parpadeo y el
 * mismatch de hidratación: el HTML ya viene filtrado con la misma moneda con
 * la que arranca el cliente.
 *
 * Al cambiar de moneda se escribe la cookie y se pide `router.refresh()`, que
 * vuelve a ejecutar los Server Components y trae los datos de la otra moneda.
 */
export function CurrencyProvider({
  children,
  modoInicial,
  monedas = MONEDAS_POR_DEFECTO,
}: {
  children: React.ReactNode
  modoInicial: Moneda
  monedas?: Moneda[]
}) {
  const router = useRouter()
  const [modo, setModo] = useState<Moneda>(modoInicial)
  const [cambiando, iniciarCambio] = useTransition()

  const valor = useMemo<Contexto>(() => {
    const seleccionadas = monedas.length > 0 ? monedas : MONEDAS_POR_DEFECTO

    // Si el usuario sacó de su lista la moneda que tenía activa, la activa
    // pasa a ser la principal. Se DERIVA en vez de corregirse con un effect:
    // un setState en effect dispararía un render extra y lo marca la regla
    // `react-hooks/set-state-in-effect`. El servidor aplica la misma regla en
    // `normalizarModo`, así que los dos lados coinciden.
    const modoEfectivo = seleccionadas.includes(modo) ? modo : seleccionadas[0]

    return {
      modo: modoEfectivo,
      monedasSeleccionadas: seleccionadas,
      cambiando,
      mostrarEquivalencias: modoEfectivo === 'USD',
      cambiarModo: (moneda: Moneda) => {
        if (moneda === modoEfectivo || !seleccionadas.includes(moneda)) return

        // `path=/` para que valga en todas las rutas, y `SameSite=Lax` porque
        // es una preferencia de UI, no algo que deba viajar entre sitios.
        document.cookie = `${COOKIE_MONEDA}=${moneda}; path=/; max-age=${MAX_EDAD_COOKIE_MONEDA}; SameSite=Lax`

        // Optimista: el selector se pinta ya, sin esperar al servidor.
        setModo(moneda)
        iniciarCambio(() => router.refresh())
      },
    }
  }, [modo, monedas, cambiando, router])

  return <MonedaContext.Provider value={valor}>{children}</MonedaContext.Provider>
}

function useMonedaContext(): Contexto {
  const contexto = useContext(MonedaContext)
  if (!contexto) {
    throw new Error('useModoMoneda debe usarse dentro de <CurrencyProvider>')
  }
  return contexto
}

/** Moneda activa, divisas disponibles y el setter. */
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
