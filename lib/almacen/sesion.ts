/**
 * SESIÓN CIFRADA — que no pidan la contraseña en cada recarga
 * =============================================================================
 *
 * Derivar la KEK cuesta 600.000 iteraciones de PBKDF2: ~300 ms en un teléfono
 * de gama media. Hacerlo en cada recarga de pestaña sería insoportable, y pedir
 * la contraseña cada vez, peor.
 *
 * EL TRUCO: IndexedDB GUARDA `CryptoKey` DIRECTO
 *
 * Una `CryptoKey` es structured-cloneable, así que entra en IndexedDB tal cual
 * —incluso siendo NO EXTRAÍBLE—. Eso significa que se guarda el handle sin que
 * los bytes de la clave pasen nunca por JavaScript: ni este código puede
 * leerlos. Es estrictamente mejor que guardar la contraseña o la clave en
 * base64 en `localStorage`, que es lo que hace casi todo el mundo.
 *
 * POR QUÉ ESTO NO AFLOJA EL MODELO DE AMENAZA
 *
 * El modo cifrado existe para que el SERVIDOR no pueda leer los datos. Guardar
 * la clave en el dispositivo no le da al servidor nada: sigue sin poder salir
 * de ahí. Lo que sí cambia es el riesgo de "alguien con la máquina desbloqueada
 * del usuario", que es el mismo riesgo que ya corre cualquier sesión abierta de
 * cualquier app, y contra el que existen el bloqueo explícito y la expiración
 * por inactividad de acá abajo.
 *
 * Un XSS tampoco se lleva la clave: puede pedirle que descifre mientras la
 * pestaña está viva, pero no exportarla. No es lo mismo.
 */

import type { Claves } from './cripto'

const BASE = 'finandir-almacen'
const DEPOSITO = 'sesion'
const REGISTRO = 'claves'

/**
 * Dos semanas sin abrir la app y hay que volver a escribir la contraseña.
 *
 * Es un número de producto, no de criptografía: largo para que no moleste a
 * quien la usa todos los días, corto para que un teléfono que quedó en un cajón
 * deje de tener la clave a mano. Se mide desde el ÚLTIMO USO, no desde que se
 * guardó, así que al que la usa seguido no se le vence nunca.
 */
export const INACTIVIDAD_MAXIMA_MS = 14 * 24 * 60 * 60 * 1000

type Guardado = {
  dek: CryptoKey
  ultimoUso: number
}

/** Puro y por eso testeable sin navegador. Ver `sesion.test.ts`. */
export function expiro(
  ultimoUso: number,
  ahora: number,
  ventana = INACTIVIDAD_MAXIMA_MS
): boolean {
  // Un `ultimoUso` en el futuro significa que alguien movió el reloj del
  // sistema. Se trata como vencido: es más seguro pedir la contraseña de más
  // que confiar en una marca que no se puede explicar.
  if (ultimoUso > ahora) return true
  return ahora - ultimoUso > ventana
}

function disponible(): boolean {
  return typeof indexedDB !== 'undefined'
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const pedido = indexedDB.open(BASE, 1)
    pedido.onupgradeneeded = () => {
      const db = pedido.result
      if (!db.objectStoreNames.contains(DEPOSITO)) db.createObjectStore(DEPOSITO)
    }
    pedido.onsuccess = () => resolver(pedido.result)
    pedido.onerror = () => rechazar(pedido.error)
  })
}

function conDeposito<T>(
  modo: IDBTransactionMode,
  hacer: (deposito: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolver, rechazar) => {
        const tx = db.transaction(DEPOSITO, modo)
        const pedido = hacer(tx.objectStore(DEPOSITO))
        pedido.onsuccess = () => resolver(pedido.result)
        pedido.onerror = () => rechazar(pedido.error)
        tx.oncomplete = () => db.close()
      })
  )
}

/**
 * Guarda la clave para las próximas recargas.
 *
 * Nunca lanza: en una ventana privada o con el almacenamiento bloqueado,
 * IndexedDB tira, y eso NO puede impedir que el usuario use la app. El costo de
 * fallar es que le van a pedir la contraseña de nuevo, no que se rompa algo.
 */
export async function recordarClaves(claves: Claves): Promise<void> {
  if (!disponible()) return
  try {
    await conDeposito('readwrite', (d) =>
      d.put({ dek: claves.dek, ultimoUso: Date.now() } satisfies Guardado, REGISTRO)
    )
  } catch {
    // Silencio a propósito: ver arriba.
  }
}

/**
 * La clave de una sesión anterior, o `null` si no hay, venció, o el navegador
 * no deja. Quien llame tiene que estar listo para pedir la contraseña.
 */
export async function recuperarClaves(ahora = Date.now()): Promise<Claves | null> {
  if (!disponible()) return null

  let guardado: Guardado | undefined
  try {
    guardado = await conDeposito<Guardado | undefined>('readonly', (d) => d.get(REGISTRO))
  } catch {
    return null
  }

  if (!guardado?.dek) return null

  if (expiro(guardado.ultimoUso, ahora)) {
    await bloquear()
    return null
  }

  // Se renueva la marca al recuperarla: "último uso" es esto, abrir la app.
  void recordarClaves({ dek: guardado.dek })

  return { dek: guardado.dek }
}

/**
 * Cierra la sesión cifrada: la clave se va del dispositivo y la próxima vez hay
 * que escribir la contraseña. Es lo que tiene que llamar el botón de "bloquear"
 * y también el logout.
 */
export async function bloquear(): Promise<void> {
  if (!disponible()) return
  try {
    await conDeposito('readwrite', (d) => d.delete(REGISTRO))
  } catch {
    // Si no se pudo borrar, expirará sola. No hay nada mejor que hacer acá.
  }
}
