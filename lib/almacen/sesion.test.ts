/**
 * Sólo la parte pura. El camino de IndexedDB NO esta cubierto: testearlo pide
 * `fake-indexeddb` y preferi no sumar otra dependencia sin consultarlo. Queda
 * anotado en los pendientes.
 */

import { describe, expect, it } from 'vitest'
import { expiro, INACTIVIDAD_MAXIMA_MS } from './sesion'

const AHORA = Date.UTC(2026, 8, 13)
const DIA = 24 * 60 * 60 * 1000

describe('expiracion por inactividad', () => {
  it('un uso reciente no vence', () => {
    expect(expiro(AHORA - DIA, AHORA)).toBe(false)
  })

  it('justo en el limite todavia vale', () => {
    expect(expiro(AHORA - INACTIVIDAD_MAXIMA_MS, AHORA)).toBe(false)
  })

  it('un milisegundo despues del limite, vence', () => {
    expect(expiro(AHORA - INACTIVIDAD_MAXIMA_MS - 1, AHORA)).toBe(true)
  })

  it('una marca en el FUTURO se trata como vencida', () => {
    // Pasa cuando alguien mueve el reloj del sistema. Ante una marca que no se
    // puede explicar, pedir la contrasenia de mas es lo barato.
    expect(expiro(AHORA + DIA, AHORA)).toBe(true)
  })

  it('la ventana se puede achicar para un modo mas estricto', () => {
    expect(expiro(AHORA - 2 * DIA, AHORA, DIA)).toBe(true)
  })
})
