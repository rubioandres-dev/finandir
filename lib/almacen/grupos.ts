/**
 * LLAVES DE GRUPO — cifrado compartido entre cuentas
 * =============================================================================
 *
 * Los gastos compartidos son el último dato en claro que nos queda. Un espacio
 * necesita filas que varias personas puedan leer, y una DEK derivada de la
 * contraseña de uno no le sirve a nadie más.
 *
 * LA CADENA, DE ARRIBA A ABAJO
 *
 *     contraseña  ->  KEK  ->  DEK        (lo de cripto.ts, personal)
 *     DEK         ->  clave privada       (envuelta, viaja con tu sobre)
 *     clave pública de cada miembro  ->  GEK   (una por miembro)
 *     GEK         ->  los gastos del grupo
 *
 * Cada usuario tiene un par de claves. La pública no es secreta y se publica;
 * la privada va envuelta por su DEK, así que sólo se abre con su contraseña.
 * Sumar a alguien a un grupo es envolverle la GEK con SU pública: el que suma
 * no necesita saber nada del secreto del otro, y el servidor ve dos sobres que
 * no puede abrir.
 *
 * RSA-OAEP Y NO ECDH
 *
 * ECDH da claves más chicas y es más rápido, pero envolver una clave para otro
 * exige un handshake con una clave efímera y un HKDF por cada envoltura. Con
 * RSA-OAEP, "envolver esto para esa pública" es UNA llamada a `wrapKey` y se
 * lee de un vistazo. Acá eso importa más que los microsegundos: este es el
 * código donde un error de más se paga con datos ajenos expuestos. El par se
 * genera una vez por usuario (~100-500 ms) y nunca más.
 *
 * EXPULSAR NO ES BORRARLE LA MEMORIA
 *
 * Al sacar a alguien se rota la GEK y se re-cifra el grupo, así que desde ese
 * momento no lee nada más: ni lo nuevo, ni lo viejo re-cifrado. Lo que ya vio
 * mientras era miembro, lo vio — eso ninguna criptografía lo desanda. Por eso
 * `rotarClaveDeGrupo` habla de "generación" y no de "revocar": describe lo que
 * de verdad hace.
 */

import { aBase64, desdeBase64 } from './base64'
import type { Claves, SobreDeClaves } from './cripto'

const LARGO_IV = 12
const VERSION_DE_FORMATO = 1

function aleatorios(largo: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(largo))
}

// --- El par de claves del usuario --------------------------------------------

/** La pública, en JWK: se guarda tal cual en la base y no es secreta. */
export type ClavePublica = JsonWebKey

export type ParDeClaves = {
  publica: ClavePublica
  /** La privada envuelta por la DEK del usuario: `v1.<iv>.<datos>`. */
  privadaEnvuelta: string
}

const RSA = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
} as const

/**
 * Genera el par del usuario. Se llama una vez, al activar el modo cifrado o al
 * entrar por primera vez a un grupo.
 *
 * La privada sale extraíble porque hay que exportarla para envolverla; el
 * handle extraíble muere en esta función, y el que se usa después sale de
 * `abrirParDeClaves`, que la reimporta sin ese permiso.
 */
export async function crearParDeClaves(claves: Claves): Promise<ParDeClaves> {
  const par = await crypto.subtle.generateKey(RSA, true, ['wrapKey', 'unwrapKey'])

  const iv = aleatorios(LARGO_IV)
  const envuelta = await crypto.subtle.wrapKey('pkcs8', par.privateKey, claves.dek, {
    name: 'AES-GCM',
    iv,
  })

  return {
    publica: await crypto.subtle.exportKey('jwk', par.publicKey),
    privadaEnvuelta: `v${VERSION_DE_FORMATO}.${aBase64(iv)}.${aBase64(new Uint8Array(envuelta))}`,
  }
}

/** Abre la privada con la DEK del usuario. Sale NO extraíble. */
export async function abrirParDeClaves(
  privadaEnvuelta: string,
  claves: Claves
): Promise<CryptoKey> {
  const partes = privadaEnvuelta.split('.')
  if (partes.length !== 3 || partes[0] !== `v${VERSION_DE_FORMATO}`) {
    throw new Error(`Formato de clave privada desconocido: "${partes[0]}"`)
  }

  return crypto.subtle.unwrapKey(
    'pkcs8',
    desdeBase64(partes[2]),
    claves.dek,
    { name: 'AES-GCM', iv: desdeBase64(partes[1]) },
    RSA,
    false,
    ['unwrapKey']
  )
}

/** Importa la pública de otro para poder envolverle algo. */
export async function importarPublica(jwk: ClavePublica): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, RSA, true, ['wrapKey'])
}

// --- La clave del grupo -------------------------------------------------------

export type SobreDeGrupo = {
  /**
   * Sube en cada rotación. Un gasto cifrado sabe con qué generación se escribió,
   * así que durante una rotación a medias se puede leer lo viejo y lo nuevo sin
   * adivinar.
   */
  generacion: number
  /** La GEK envuelta con la pública del miembro: `v1.<datos>`. RSA no lleva IV. */
  claveEnvuelta: string
}

/** Genera la clave de un grupo nuevo. No se guarda en ningún lado sin envolver. */
export async function crearClaveDeGrupo(): Promise<CryptoKey> {
  // Extraíble: hay que poder envolverla para cada miembro. Nunca se exporta a
  // otro lado que no sea `wrapKey`.
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])
}

/**
 * Envuelve la clave del grupo para un miembro.
 *
 * Esto es lo que convierte a "admin" en una capacidad real y no en un permiso
 * declarativo: sólo quien PUEDE abrir la GEK puede envolvérsela a alguien más.
 * Sin la clave, marcarse admin en la base no sirve de nada.
 */
export async function envolverParaMiembro(
  gek: CryptoKey,
  publicaDelMiembro: CryptoKey,
  generacion: number
): Promise<SobreDeGrupo> {
  const envuelta = await crypto.subtle.wrapKey('raw', gek, publicaDelMiembro, {
    name: 'RSA-OAEP',
  })

  return {
    generacion,
    claveEnvuelta: `v${VERSION_DE_FORMATO}.${aBase64(new Uint8Array(envuelta))}`,
  }
}

/** Abre la clave del grupo con la privada del miembro. */
export async function abrirClaveDeGrupo(
  sobre: SobreDeGrupo,
  privada: CryptoKey,
  extraible = false
): Promise<CryptoKey> {
  const partes = sobre.claveEnvuelta.split('.')
  if (partes.length !== 2 || partes[0] !== `v${VERSION_DE_FORMATO}`) {
    throw new Error(`Formato de clave de grupo desconocido: "${partes[0]}"`)
  }

  return crypto.subtle.unwrapKey(
    'raw',
    desdeBase64(partes[1]),
    privada,
    { name: 'RSA-OAEP' },
    { name: 'AES-GCM', length: 256 },
    extraible,
    ['encrypt', 'decrypt']
  )
}

// --- Los datos del grupo ------------------------------------------------------

/**
 * Cifra un gasto (o cualquier cosa del grupo) con la clave del grupo.
 *
 * Devuelve texto y no bytes porque esto va a una columna `text` al lado de
 * datos en claro que el servidor SÍ necesita —`space_id`, la generación, la
 * fecha de creación— y no a un bloque opaco como el almacén personal.
 */
export async function cifrarDelGrupo(gek: CryptoKey, valor: unknown): Promise<string> {
  const iv = aleatorios(LARGO_IV)
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    gek,
    new TextEncoder().encode(JSON.stringify(valor))
  )

  return `v${VERSION_DE_FORMATO}.${aBase64(iv)}.${aBase64(new Uint8Array(cifrado))}`
}

export async function descifrarDelGrupo<T>(gek: CryptoKey, paquete: string): Promise<T> {
  const partes = paquete.split('.')
  if (partes.length !== 3 || partes[0] !== `v${VERSION_DE_FORMATO}`) {
    throw new Error(`Formato de dato de grupo desconocido: "${partes[0]}"`)
  }

  const plano = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: desdeBase64(partes[1]) },
    gek,
    desdeBase64(partes[2])
  )

  return JSON.parse(new TextDecoder().decode(plano)) as T
}

// --- Rotación -----------------------------------------------------------------

export type MiembroConClave = {
  memberId: string
  publica: ClavePublica
}

export type Rotacion = {
  generacion: number
  gek: CryptoKey
  /** Un sobre nuevo por miembro que SIGUE en el grupo. */
  sobres: { memberId: string; sobre: SobreDeGrupo }[]
}

/**
 * Clave nueva para los que quedan.
 *
 * Quien se fue NO está en `quedan`, así que no recibe sobre y desde la
 * generación nueva no puede abrir nada — ni los gastos nuevos ni los viejos una
 * vez re-cifrados. Re-cifrar los gastos existentes con la GEK nueva es
 * responsabilidad de quien llame: acá sólo se reparte la llave.
 *
 * Es lo que hay que correr al expulsar a alguien Y también si se sospecha que
 * una clave se filtró.
 */
export async function rotarClaveDeGrupo(
  generacionActual: number,
  quedan: MiembroConClave[]
): Promise<Rotacion> {
  const gek = await crearClaveDeGrupo()
  const generacion = generacionActual + 1

  const sobres = await Promise.all(
    quedan.map(async ({ memberId, publica }) => ({
      memberId,
      sobre: await envolverParaMiembro(gek, await importarPublica(publica), generacion),
    }))
  )

  return { generacion, gek, sobres }
}

// --- El par, dentro del sobre -------------------------------------------------

/**
 * Devuelve el sobre con su par de claves, creandolo si no lo tenia.
 *
 * Los sobres anteriores a los grupos no lo traen. En vez de una migracion que
 * el usuario no pidio —y que le pediria la contrasenia sin motivo aparente—, el
 * par nace la primera vez que hace falta de verdad: al entrar a un grupo.
 *
 * Devuelve tambien si HUBO que crearlo, porque en ese caso quien llame tiene
 * que guardar el sobre nuevo. Devolverlo sin avisar dejaria un par que se
 * regenera en cada sesion y sobres de grupo que dejan de abrir.
 */
export async function asegurarParDeClaves(
  sobre: SobreDeClaves,
  claves: Claves
): Promise<{ sobre: SobreDeClaves; claves: Claves; creado: boolean }> {
  if (sobre.par) {
    return {
      sobre,
      claves: { ...claves, privada: await abrirParDeClaves(sobre.par.privadaEnvuelta, claves) },
      creado: false,
    }
  }

  const par = await crearParDeClaves(claves)

  return {
    sobre: { ...sobre, par },
    claves: { ...claves, privada: await abrirParDeClaves(par.privadaEnvuelta, claves) },
    creado: true,
  }
}
