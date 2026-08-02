'use client'

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react'

export type Moneda = 'ARS' | 'USD'

const CLAVE = 'finandir:moneda'
const POR_DEFECTO: Moneda = 'ARS'

type Contexto = {
  moneda: Moneda
  cambiar: (moneda: Moneda) => void
  alternar: () => void
}

const CurrencyContext = createContext<Contexto | null>(null)

// --- store externo mínimo sobre localStorage -------------------------------
// useSyncExternalStore en vez de useState + useEffect: el server no tiene
// localStorage, y este hook está hecho para ese caso sin romper la hidratación.

const suscriptores = new Set<() => void>()

function suscribir(alCambiar: () => void) {
  suscriptores.add(alCambiar)
  // 'storage' cubre el cambio hecho en otra pestaña.
  window.addEventListener('storage', alCambiar)
  return () => {
    suscriptores.delete(alCambiar)
    window.removeEventListener('storage', alCambiar)
  }
}

function leer(): Moneda {
  try {
    return window.localStorage.getItem(CLAVE) === 'USD' ? 'USD' : 'ARS'
  } catch {
    return POR_DEFECTO
  }
}

function leerEnServidor(): Moneda {
  return POR_DEFECTO
}

function escribir(moneda: Moneda) {
  try {
    window.localStorage.setItem(CLAVE, moneda)
  } catch {
    // Modo incógnito con storage bloqueado: la preferencia dura la sesión.
  }
  for (const notificar of suscriptores) notificar()
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const moneda = useSyncExternalStore(suscribir, leer, leerEnServidor)

  const cambiar = useCallback((siguiente: Moneda) => escribir(siguiente), [])
  const alternar = useCallback(() => escribir(leer() === 'ARS' ? 'USD' : 'ARS'), [])

  const valor = useMemo(() => ({ moneda, cambiar, alternar }), [moneda, cambiar, alternar])

  return <CurrencyContext.Provider value={valor}>{children}</CurrencyContext.Provider>
}

export function useMoneda(): Contexto {
  const contexto = useContext(CurrencyContext)
  if (!contexto) {
    throw new Error('useMoneda debe usarse dentro de <CurrencyProvider>')
  }
  return contexto
}
