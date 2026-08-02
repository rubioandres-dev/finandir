'use client'

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react'

const CLAVE = 'finandir:equivalencias'

type Contexto = {
  /** Si se muestran las conversiones aproximadas junto a cada importe. */
  mostrarEquivalencias: boolean
  alternar: () => void
}

const EquivalenciasContext = createContext<Contexto | null>(null)

// --- store externo mínimo sobre localStorage -------------------------------
// useSyncExternalStore en vez de useState + useEffect: el server no tiene
// localStorage, y este hook está hecho para ese caso sin romper la hidratación.

const suscriptores = new Set<() => void>()

function suscribir(alCambiar: () => void) {
  suscriptores.add(alCambiar)
  window.addEventListener('storage', alCambiar)
  return () => {
    suscriptores.delete(alCambiar)
    window.removeEventListener('storage', alCambiar)
  }
}

function leer(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) === '1'
  } catch {
    return false
  }
}

/** Por defecto apagadas: la conversión es referencia, no el dato principal. */
function leerEnServidor(): boolean {
  return false
}

function escribir(valor: boolean) {
  try {
    window.localStorage.setItem(CLAVE, valor ? '1' : '0')
  } catch {
    // Modo incógnito con storage bloqueado: la preferencia dura la sesión.
  }
  for (const notificar of suscriptores) notificar()
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const mostrarEquivalencias = useSyncExternalStore(suscribir, leer, leerEnServidor)

  const alternar = useCallback(() => escribir(!leer()), [])

  const valor = useMemo(
    () => ({ mostrarEquivalencias, alternar }),
    [mostrarEquivalencias, alternar]
  )

  return (
    <EquivalenciasContext.Provider value={valor}>{children}</EquivalenciasContext.Provider>
  )
}

export function useEquivalencias(): Contexto {
  const contexto = useContext(EquivalenciasContext)
  if (!contexto) {
    throw new Error('useEquivalencias debe usarse dentro de <CurrencyProvider>')
  }
  return contexto
}
