/**
 * Cifrado simétrico del lado del cliente, sobre Web Crypto.
 *
 * QUÉ GARANTIZA Y QUÉ NO
 *
 * Garantiza que lo que sale del dispositivo es AES-GCM-256 y que la clave se
 * deriva del PIN del usuario, que nunca viaja. El servidor guarda un string
 * opaco y no tiene con qué abrirlo: eso es el "zero-knowledge".
 *
 * NO garantiza nada sobre la fuerza del PIN, y esa es la letra chica que hay
 * que mirar antes de decidir si esta arquitectura va a producción. PBKDF2
 * encarece cada intento, no achica el espacio de búsqueda: un PIN de 4 dígitos
 * son 10.000 combinaciones y una de 6, un millón. A 600.000 iteraciones cada
 * intento cuesta unos cientos de milisegundos en este navegador, pero quien se
 * robe el ciphertext lo ataca offline, en paralelo y sobre GPU. El orden de
 * magnitud ahí es de horas, no de siglos.
 *
 * O sea: contra el servidor —que es la amenaza que este modo quiere tapar— un
 * PIN alcanza. Contra alguien que se lleva la base entera, no. Si el POC
 * avanza, la decisión de producto es passphrase o PIN + factor del dispositivo
 * (WebAuthn PRF, Keychain, Android Keystore), no subir las iteraciones.
 *
 * ESTE MÓDULO NO LLEVA 'use client', Y ES A PROPÓSITO
 *
 * `crypto.subtle` existe igual en Node, así que el módulo corre en los dos
 * lados y se puede testear sin navegador. La garantía no la da el archivo: la
 * da DÓNDE se lo llama. Si un Server Component importa esto y cifra ahí, el
 * PIN pasó por el servidor y el modelo se cayó entero. Llamarlo solo desde
 * componentes de cliente es la regla que hay que sostener a mano.
 */

/**
 * 600.000, que es lo que recomienda OWASP para PBKDF2-HMAC-SHA256.
 *
 * El número es parte del formato: si se cambia, todo lo cifrado antes deja de
 * abrirse. Por eso el respaldo se lleva su copia adentro (ver `drive-poc`).
 */
export const ITERACIONES_PBKDF2 = 600_000

/** 16 bytes: el mínimo que recomienda el NIST para la sal de PBKDF2. */
const LARGO_SAL = 16

/**
 * 96 bits, que es el IV nativo de GCM.
 *
 * No es una preferencia: con cualquier otro largo la especificación manda
 * pasar el IV por GHASH, más lento y peor analizado. Y es un IV NUEVO por cada
 * cifrado —nunca derivado del contenido ni de un contador guardado—: repetir
 * el par (clave, IV) en GCM no filtra un mensaje, filtra la clave de
 * autenticación y con eso se pueden forjar mensajes.
 */
const LARGO_IV = 12

/**
 * Prefijo de formato.
 *
 * Sale en cada string cifrado para que el día que cambie el algoritmo, las
 * iteraciones o el orden de los campos se pueda distinguir lo viejo de lo
 * nuevo y descifrar las dos cosas. Un ciphertext sin versión adentro es una
 * migración que no se puede hacer.
 */
const VERSION = 'v1'

/** Cómo queda un string cifrado: `v1.<iv en base64>.<datos en base64>`. */
export const FORMATO = `${VERSION}.<iv>.<datos>`

function aBase64(bytes: Uint8Array): string {
  // De a un byte y no con spread: `String.fromCharCode(...bytes)` revienta con
  // "Maximum call stack size exceeded" apenas el respaldo pasa las ~100 kB.
  let binario = ''
  for (const byte of bytes) binario += String.fromCharCode(byte)
  return btoa(binario)
}

/**
 * El `<ArrayBuffer>` no es decorativo: desde TypeScript 5.7 `Uint8Array` a
 * secas significa `Uint8Array<ArrayBufferLike>`, que incluye `SharedArrayBuffer`
 * y por eso NO es asignable al `BufferSource` que pide Web Crypto. Sin el
 * parámetro explícito, cada llamada a `subtle` no compila.
 */
function desdeBase64(texto: string): Uint8Array<ArrayBuffer> {
  const binario = atob(texto)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i)
  return bytes
}

/**
 * Sal nueva, en base64.
 *
 * La sal NO es secreta y se guarda junto al dato cifrado: lo único que hace es
 * que dos usuarios con el mismo PIN no deriven la misma clave, y que no se
 * pueda precalcular una tabla contra todos a la vez. Perderla, en cambio, es
 * perder el respaldo: sin ella el PIN correcto deriva una clave distinta.
 */
export function generarSal(): string {
  return aBase64(crypto.getRandomValues(new Uint8Array(LARGO_SAL)))
}

/**
 * Deriva la clave AES-GCM-256 del usuario a partir de su PIN o passphrase.
 *
 * `salt` va en base64 —lo que devuelve `generarSal()`— o en bytes crudos.
 *
 * La clave sale NO EXTRAÍBLE: ni siquiera este código puede volver a leer sus
 * bytes después de crearla. Es gratis y cierra la puerta a que un XSS se la
 * lleve entera; con `extractable: true` alcanzaría un `exportKey` para
 * quedarse con todo el historial del usuario de una.
 */
export async function generateUserKey(
  pinOrPassword: string,
  salt: string | Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  const sal = typeof salt === 'string' ? desdeBase64(salt) : salt

  // El PIN entra como "material" y no como clave: PBKDF2 es lo único que
  // puede hacer con él, así que ni por error se puede usar para cifrar directo.
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pinOrPassword),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal, iterations: ITERACIONES_PBKDF2, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Cifra un string —o un JSON ya serializado— y devuelve un solo valor opaco.
 *
 * El IV viaja adentro del string y no en una columna aparte a propósito: es lo
 * que hace que el resultado entre en un `text` cualquiera de la base sin
 * cambiar el esquema, y que sea imposible guardar el dato y perder el IV.
 * Público no es lo mismo que secreto: el IV de GCM puede verse, lo que no
 * puede es repetirse.
 */
export async function encryptData(plainText: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(LARGO_IV))

  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plainText)
  )

  return `${VERSION}.${aBase64(iv)}.${aBase64(new Uint8Array(cifrado))}`
}

/**
 * Descifra en el dispositivo lo que produjo `encryptData`.
 *
 * Tira si el PIN es otro Y TAMBIÉN si alguien tocó un solo bit del dato: GCM
 * autentica además de cifrar, así que el servidor no puede modificar un importe
 * a ciegas. Ese error no es una falla del POC, es la propiedad que se quiere
 * demostrar, y por eso se traduce en vez de dejar pasar el `OperationError`
 * pelado del navegador.
 */
export async function decryptData(cipherText: string, key: CryptoKey): Promise<string> {
  const partes = cipherText.split('.')

  if (partes.length !== 3 || partes[0] !== VERSION) {
    throw new Error(`Formato desconocido: se esperaba "${FORMATO}"`)
  }

  const [, iv, datos] = partes

  let plano: ArrayBuffer
  try {
    plano = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: desdeBase64(iv) },
      key,
      desdeBase64(datos)
    )
  } catch {
    throw new Error('No se pudo descifrar: el PIN no es el correcto o el dato fue alterado')
  }

  return new TextDecoder().decode(plano)
}
