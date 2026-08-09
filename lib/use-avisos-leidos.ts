'use client'

import { useSyncExternalStore } from 'react'
import type { Aviso } from '@/lib/header-data'

/**
 * Qué avisos de la campana ya vio el usuario.
 *
 * POR QUÉ localStorage Y NO UNA TABLA
 *
 * Un aviso no es un dato: es una vista derivada de los días de cierre y
 * vencimiento de las tarjetas, que se recalcula entera en cada request. No hay
 * fila que marcar. Guardar el "leído" en Supabase pediría una tabla nueva, su
 * migración y su política RLS para sostener un booleano por dispositivo que
 * además caduca en una semana. El recorrido guiado resuelve lo mismo así, y
 * este estado tiene exactamente el mismo peso: una preferencia local.
 *
 * El costo es que abrir la campana en el teléfono no la apaga en la
 * computadora. Es el comportamiento correcto igual: "ya lo vi" es sobre esta
 * pantalla, no sobre la cuenta.
 *
 * POR QUÉ SE REEMPLAZA Y NO SE ACUMULA
 *
 * `marcarLeidos` PISA lo guardado con las claves de la ventana actual en vez de
 * unirlas con lo anterior. Eso poda solo: una clave lleva la fecha de su
 * ocurrencia, así que en cuanto esa fecha sale de los próximos 7 días ya no
 * puede volver a mostrarse, y guardarla sería basura que crece para siempre.
 */

const CLAVE_ALMACENADA = 'aurem:avisos-leidos'

/**
 * Identidad de UNA ocurrencia del aviso.
 *
 * Va con la fecha adentro a propósito: el vencimiento de la misma tarjeta
 * vuelve el mes que viene y tiene que volver a avisar. Ver `Aviso.fecha`.
 */
export function claveDeAviso(aviso: Aviso): string {
  return `${aviso.id}@${aviso.fecha}`
}

const NINGUNO: ReadonlySet<string> = new Set()

/**
 * `null` hasta que el navegador dice lo suyo, y es el punto del diseño: en el
 * servidor no hay forma de saber qué se leyó, así que el render de hidratación
 * muestra la campana APAGADA y recién después aparece el punto si de verdad
 * hay algo sin leer.
 *
 * Al revés —asumir "nada leído" en el servidor— el caso normal, que es no
 * tener nada nuevo, mostraría el punto en el primer pintado y lo apagaría un
 * frame después. Ese parpadeo es justo la molestia que este archivo viene a
 * sacar.
 */
let leidos: ReadonlySet<string> | null = null

const suscriptores = new Set<() => void>()

function avisarATodos() {
  for (const avisar of suscriptores) avisar()
}

function leerDelNavegador(): ReadonlySet<string> {
  try {
    const crudo = window.localStorage.getItem(CLAVE_ALMACENADA)
    if (!crudo) return NINGUNO
    const valor: unknown = JSON.parse(crudo)
    if (!Array.isArray(valor)) return NINGUNO
    return new Set(valor.filter((v): v is string => typeof v === 'string'))
  } catch {
    // Safari en privado tira al leer, y un JSON corrupto tira al parsear. En
    // los dos casos se asume que no se leyó nada: mostrar un aviso de más es
    // mejor que esconder un vencimiento.
    return NINGUNO
  }
}

if (typeof window !== 'undefined') {
  leidos = leerDelNavegador()

  // Otra pestaña abrió la campana. El evento `storage` NO le llega a la
  // pestaña que escribió —por eso `marcarLeidos` avisa por su cuenta—, y con
  // `key: null` el navegador informa un `clear()` entero.
  window.addEventListener('storage', (evento) => {
    if (evento.key !== null && evento.key !== CLAVE_ALMACENADA) return
    leidos = leerDelNavegador()
    avisarATodos()
  })
}

/** Da por vistos exactamente estos avisos. Lo anterior se descarta. */
export function marcarLeidos(claves: readonly string[]): void {
  leidos = new Set(claves)
  try {
    window.localStorage.setItem(CLAVE_ALMACENADA, JSON.stringify(claves))
  } catch {
    // Sin almacenamiento la campana se apaga igual en esta sesión; vuelve a
    // encenderse en la próxima carga. Molesto, pero no roto.
  }
  avisarATodos()
}

/**
 * `getSnapshot` devuelve la misma referencia mientras el valor no cambia —el
 * Set se reemplaza solo cuando algo se marcó de verdad—, que es lo que
 * `useSyncExternalStore` necesita para no entrar en un loop de renders.
 */
function suscribir(alCambiar: () => void) {
  suscriptores.add(alCambiar)
  return () => suscriptores.delete(alCambiar)
}

const LEER = () => leidos
const LEER_EN_EL_SERVIDOR = () => null

/** Claves ya vistas, o `null` mientras el render todavía es el del servidor. */
export function useAvisosLeidos(): ReadonlySet<string> | null {
  return useSyncExternalStore(suscribir, LEER, LEER_EN_EL_SERVIDOR)
}
