/**
 * CIFRADO C3 — DEK envuelta, y un envoltorio que no es un backend
 * =============================================================================
 *
 * `crearAlmacenCifrado()` devuelve un `Almacen` que recibe otro `Almacen`
 * adentro: cifra al escribir y descifra al leer, y el de abajo nunca ve texto
 * claro. Por eso el contenido de `Almacen` es `Uint8Array` — si fueran objetos,
 * el cifrado tendría que vivir adentro del backend nube, duplicado y ausente en
 * los otros. Así se compone:
 *
 *     crearLibro(crearAlmacenCifrado(crearAlmacenNube(...), claves))
 *     crearLibro(crearAlmacenDrive(...))                    // sin cifrar
 *
 * DOS CLAVES, Y NO ES ADORNO
 *
 *     DEK  aleatoria de 256 bits. Es la que cifra los datos.
 *     KEK  derivada de la contraseña. Sólo envuelve a la DEK.
 *
 * Esta es LA diferencia con `lib/crypto.ts` del POC de agosto, que deriva la
 * clave de datos directo del PIN. Con ese modelo, cambiar la contraseña obliga
 * a bajar, descifrar, re-cifrar y subir años de movimientos desde el navegador,
 * sin poder cortar por la mitad y sin transacción que lo proteja. Acá cambiar
 * la contraseña re-envuelve 32 bytes. Es el error clásico del cifrado en
 * cliente y es irreversible una vez que hay usuarios con datos.
 *
 * La misma DEK se envuelve una segunda vez con un CÓDIGO DE RECUPERACIÓN. Sin
 * esa segunda envoltura, olvidar la contraseña es perder todo — el mismo
 * agujero que tiene el modo Drive, pero sin que el usuario haya elegido
 * bancárselo.
 *
 * CADA ENVOLTURA LLEVA SU PROPIA SAL
 *
 * Parece un detalle y es lo que hace posible cambiar la contraseña. Con una
 * sola sal compartida, rotarla obliga a re-derivar TAMBIÉN la KEK de
 * recuperación, y para eso haría falta el código en claro — que por diseño no
 * se guarda en ningún lado. Con una sal por envoltura, cambiar la contraseña
 * toca únicamente su envoltura y el código anotado en papel sigue sirviendo,
 * intacto.
 *
 * LO QUE SE FILTRA IGUAL
 *
 * El servidor no puede leer nada, pero ve los nombres de los bloques y su
 * tamaño: deduce que existe `mov-2026` y, por el peso, el orden de magnitud de
 * cuántos movimientos hay. No se filtran importes, descripciones ni fechas. No
 * es "cero conocimiento", es "cero contenido", y se dice así.
 *
 * SOBRE LA FUERZA DEL SECRETO — la letra chica que hereda del POC
 *
 * PBKDF2 encarece cada intento, no achica el espacio de búsqueda. Contra el
 * servidor —la amenaza que este modo tapa— una contraseña normal alcanza.
 * Contra alguien que se lleva la base entera y ataca offline sobre GPU, no. La
 * respuesta a eso es passphrase larga o un factor del dispositivo (WebAuthn
 * PRF), no subir las iteraciones.
 */

import { aBase64, desdeBase64 } from './base64'
import {
  ConflictoDeVersion,
  type Almacen,
  type Bloque,
  type Clave,
  type Version,
  type VersionEsperada,
} from './tipos'

// --- Parámetros del formato --------------------------------------------------

/** 600.000: lo que recomienda OWASP para PBKDF2-HMAC-SHA256. */
export const ITERACIONES_PBKDF2 = 600_000

/** 16 bytes, el mínimo que recomienda el NIST para la sal. */
const LARGO_SAL = 16

/**
 * 96 bits, el IV nativo de GCM. Con cualquier otro largo la especificación
 * manda pasar el IV por GHASH: más lento y peor analizado. Y va uno NUEVO por
 * cada cifrado: repetir el par (clave, IV) en GCM no filtra un mensaje, filtra
 * la clave de autenticación y permite forjar mensajes.
 */
const LARGO_IV = 12

/** Versión del formato, adentro de cada dato cifrado. */
const VERSION_DE_FORMATO = 1

const codificador = new TextEncoder()

function aleatorios(largo: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(largo))
}

// --- El sobre ----------------------------------------------------------------

/**
 * Una envoltura de la DEK. Es AUTODESCRIPTIVA a propósito, igual que el
 * respaldo del POC: si mañana se suben las iteraciones o se cambia el KDF, las
 * envolturas viejas se siguen abriendo porque cada una declara con qué se hizo.
 * Un dato cifrado que no puede describirse a sí mismo es un dato perdido con
 * pasos extra.
 */
export type Envoltura = {
  /** La DEK envuelta: `v1.<iv en base64>.<datos en base64>`. */
  paquete: string
  /** Base64. Pública por diseño; perderla es perder los datos. */
  sal: string
  kdf: 'PBKDF2-SHA256'
  iteraciones: number
}

/**
 * Lo que se guarda en Supabase junto al usuario. NADA de esto es secreto: son
 * las dos envolturas de la DEK más los parámetros para rehacer cada KEK. Sin
 * la contraseña o el código de recuperación no sirven para nada.
 */
export type SobreDeClaves = {
  version: 1
  porContrasena: Envoltura
  porRecuperacion: Envoltura
  creado: string
}

/** La DEK ya abierta. Vive en memoria y no es extraíble. */
export type Claves = {
  dek: CryptoKey
}

export class SecretoIncorrecto extends Error {
  constructor() {
    super('La contraseña o el código de recuperación no son correctos.')
    this.name = 'SecretoIncorrecto'
  }
}

// --- Derivación --------------------------------------------------------------

export function generarSal(): string {
  return aBase64(aleatorios(LARGO_SAL))
}

/**
 * Deriva la KEK desde el secreto del usuario.
 *
 * Sale con usos `wrapKey`/`unwrapKey` y NADA más: esta clave no puede cifrar
 * datos aunque alguien se confunda de función. Y sale no extraíble, así que ni
 * este código puede volver a leer sus bytes.
 */
async function derivarKek(secreto: string, envoltura: Envoltura): Promise<CryptoKey> {
  // El secreto entra como "material" y no como clave: PBKDF2 es lo único que
  // se puede hacer con él.
  const material = await crypto.subtle.importKey(
    'raw',
    codificador.encode(secreto),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: desdeBase64(envoltura.sal),
      iterations: envoltura.iteraciones,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  )
}

// --- Envolver y abrir la DEK -------------------------------------------------

async function envolver(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  const iv = aleatorios(LARGO_IV)
  const envuelta = await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv })
  return `v${VERSION_DE_FORMATO}.${aBase64(iv)}.${aBase64(new Uint8Array(envuelta))}`
}

/**
 * `extraible` sólo se pone en `true` para rotar: ahí hay que volver a
 * envolverla, y `wrapKey` no acepta una clave que no se pueda exportar. Para
 * uso normal sale sin ese permiso, así que un XSS puede pedirle que descifre
 * pero no llevársela.
 */
async function desenvolver(
  paquete: string,
  kek: CryptoKey,
  extraible = false
): Promise<CryptoKey> {
  const partes = paquete.split('.')
  if (partes.length !== 3 || partes[0] !== `v${VERSION_DE_FORMATO}`) {
    throw new Error(`Formato de envoltura desconocido: "${partes[0]}"`)
  }

  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      desdeBase64(partes[2]),
      kek,
      { name: 'AES-GCM', iv: desdeBase64(partes[1]) },
      { name: 'AES-GCM', length: 256 },
      extraible,
      ['encrypt', 'decrypt']
    )
  } catch {
    // GCM autentica además de cifrar: esto falla tanto si el secreto es otro
    // como si alguien tocó un bit del sobre.
    throw new SecretoIncorrecto()
  }
}

function envolturaNueva(
  paquete: string,
  sal: string,
  iteraciones = ITERACIONES_PBKDF2
): Envoltura {
  return { paquete, sal, kdf: 'PBKDF2-SHA256', iteraciones }
}

// --- Código de recuperación --------------------------------------------------

/**
 * Alfabeto sin I, L, O ni U: se confunden con 1, 0 y V al copiarlas a mano, y
 * este código se anota en papel. 30 símbolos × 20 caracteres ≈ 98 bits.
 */
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const LARGO_CODIGO = 20

/**
 * Formato `XXXXX-XXXXX-XXXXX-XXXXX`. Los guiones son de la presentación: se
 * sacan antes de derivar, así que da igual si el usuario los escribe o no.
 */
export function generarCodigoDeRecuperacion(): string {
  const bytes = aleatorios(LARGO_CODIGO)
  const letras = [...bytes].map((b) => ALFABETO[b % ALFABETO.length])
  return (letras.join('').match(/.{1,5}/g) ?? []).join('-')
}

/** Tolera guiones, espacios y minúsculas: lo tipea una persona. */
export function normalizarCodigo(codigo: string): string {
  return codigo.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

// --- API pública -------------------------------------------------------------

export type SobreNuevo = {
  sobre: SobreDeClaves
  /** Se muestra UNA vez y no se guarda en ningún lado. */
  codigoDeRecuperacion: string
  claves: Claves
}

/**
 * Crea la DEK y sus dos envolturas. Se llama una sola vez, al activar el modo.
 *
 * `iteraciones` se puede bajar SOLO en tests: 600.000 son ~300 ms por
 * derivación y una suite con veinte sobres tardaría medio minuto. Es seguro
 * exponerlo porque cada envoltura guarda con cuántas se hizo, asi que un sobre
 * de test nunca se confunde con uno real ni deja de abrirse.
 */
export async function crearSobre(
  contrasena: string,
  iteraciones = ITERACIONES_PBKDF2
): Promise<SobreNuevo> {
  const codigoDeRecuperacion = generarCodigoDeRecuperacion()

  const porContrasena = envolturaNueva('', generarSal(), iteraciones)
  const porRecuperacion = envolturaNueva('', generarSal(), iteraciones)

  // `extractable: true` es obligatorio para poder envolverla. El handle
  // extraíble vive sólo dentro de esta función; el que se devuelve sale de
  // `desenvolver()`, que la reimporta sin ese permiso.
  const dekExtraible = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )

  const [kekContrasena, kekRecuperacion] = await Promise.all([
    derivarKek(contrasena, porContrasena),
    derivarKek(normalizarCodigo(codigoDeRecuperacion), porRecuperacion),
  ])

  const [paqueteContrasena, paqueteRecuperacion] = await Promise.all([
    envolver(dekExtraible, kekContrasena),
    envolver(dekExtraible, kekRecuperacion),
  ])

  const sobre: SobreDeClaves = {
    version: 1,
    porContrasena: { ...porContrasena, paquete: paqueteContrasena },
    porRecuperacion: { ...porRecuperacion, paquete: paqueteRecuperacion },
    creado: new Date().toISOString(),
  }

  return {
    sobre,
    codigoDeRecuperacion,
    claves: { dek: await desenvolver(paqueteContrasena, kekContrasena) },
  }
}

/** Abre el sobre con la contraseña del usuario. */
export async function abrirConContrasena(
  sobre: SobreDeClaves,
  contrasena: string
): Promise<Claves> {
  const kek = await derivarKek(contrasena, sobre.porContrasena)
  return { dek: await desenvolver(sobre.porContrasena.paquete, kek) }
}

/** Abre el sobre con el código que el usuario anotó al activar el modo. */
export async function abrirConRecuperacion(
  sobre: SobreDeClaves,
  codigo: string
): Promise<Claves> {
  const kek = await derivarKek(normalizarCodigo(codigo), sobre.porRecuperacion)
  return { dek: await desenvolver(sobre.porRecuperacion.paquete, kek) }
}

/**
 * Cambia la contraseña re-envolviendo la DEK. NO toca un solo byte de los
 * datos, que es el punto entero del modelo.
 *
 * `porRecuperacion` queda EXACTAMENTE como estaba —mismo paquete, misma sal—,
 * así que el código anotado en papel sigue abriendo. Eso es posible sólo porque
 * cada envoltura tiene su sal propia; con una sal compartida habría que
 * re-derivar también esa KEK y haría falta el código en claro.
 */
export async function rotarContrasena(
  sobre: SobreDeClaves,
  contrasenaVieja: string,
  contrasenaNueva: string
): Promise<SobreDeClaves> {
  const kekVieja = await derivarKek(contrasenaVieja, sobre.porContrasena)
  const dekExtraible = await desenvolver(sobre.porContrasena.paquete, kekVieja, true)

  // Sal nueva: el trabajo de PBKDF2 que un atacante haya hecho contra la sal
  // vieja no le sirve para la nueva.
  // Se conservan las iteraciones del sobre: si se subieran acá en silencio,
  // un sobre viejo cambiaria de costo sin que nadie lo haya decidido.
  const porContrasena = envolturaNueva('', generarSal(), sobre.porContrasena.iteraciones)
  const kekNueva = await derivarKek(contrasenaNueva, porContrasena)

  return {
    ...sobre,
    porContrasena: { ...porContrasena, paquete: await envolver(dekExtraible, kekNueva) },
  }
}

/**
 * Emite un código de recuperación nuevo e invalida el anterior. Pide la
 * contraseña porque hay que abrir la DEK para volver a envolverla.
 */
export async function rotarRecuperacion(
  sobre: SobreDeClaves,
  contrasena: string
): Promise<{ sobre: SobreDeClaves; codigoDeRecuperacion: string }> {
  const kek = await derivarKek(contrasena, sobre.porContrasena)
  const dekExtraible = await desenvolver(sobre.porContrasena.paquete, kek, true)

  const codigoDeRecuperacion = generarCodigoDeRecuperacion()
  const porRecuperacion = envolturaNueva('', generarSal(), sobre.porRecuperacion.iteraciones)
  const kekRecuperacion = await derivarKek(
    normalizarCodigo(codigoDeRecuperacion),
    porRecuperacion
  )

  return {
    sobre: {
      ...sobre,
      porRecuperacion: {
        ...porRecuperacion,
        paquete: await envolver(dekExtraible, kekRecuperacion),
      },
    },
    codigoDeRecuperacion,
  }
}

// --- El envoltorio de almacén ------------------------------------------------

/**
 * Formato de un bloque cifrado, binario y sin base64 (el `Almacen` ya toma
 * bytes; pasarlo a texto sería 33% más de transferencia para nada):
 *
 *     [ 1 byte  versión de formato ]
 *     [ 12 bytes IV aleatorio      ]
 *     [ resto   ciphertext + tag   ]
 */
export function crearAlmacenCifrado(interno: Almacen, claves: Claves): Almacen {
  async function cifrar(contenido: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    const iv = aleatorios(LARGO_IV)
    const cifrado = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, claves.dek, contenido)
    )

    const salida = new Uint8Array(1 + LARGO_IV + cifrado.byteLength)
    salida[0] = VERSION_DE_FORMATO
    salida.set(iv, 1)
    salida.set(cifrado, 1 + LARGO_IV)
    return salida
  }

  async function descifrar(contenido: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    if (contenido.byteLength <= 1 + LARGO_IV) {
      throw new Error('Bloque cifrado truncado.')
    }
    if (contenido[0] !== VERSION_DE_FORMATO) {
      throw new Error(`Formato de bloque desconocido: v${contenido[0]}`)
    }

    const iv = contenido.slice(1, 1 + LARGO_IV)
    const datos = contenido.slice(1 + LARGO_IV)

    try {
      return new Uint8Array(
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, claves.dek, datos)
      )
    } catch {
      throw new SecretoIncorrecto()
    }
  }

  return {
    tipo: interno.tipo,

    async obtener(clave: Clave): Promise<Bloque | null> {
      const bloque = await interno.obtener(clave)
      if (!bloque) return null
      return { ...bloque, contenido: await descifrar(bloque.contenido) }
    },

    async guardar(
      clave: Clave,
      contenido: Uint8Array<ArrayBuffer>,
      versionEsperada: VersionEsperada
    ) {
      try {
        const guardado = await interno.guardar(clave, await cifrar(contenido), versionEsperada)
        // Se devuelve el contenido EN CLARO que entró, no el cifrado: quien
        // llamó no tiene por qué enterarse de que pasó por acá.
        return { ...guardado, contenido }
      } catch (error) {
        // El conflicto trae el bloque actual cifrado. Descifrarlo acá le ahorra
        // un viaje al lazo de reintentos.
        if (error instanceof ConflictoDeVersion && error.actual) {
          throw new ConflictoDeVersion(clave, {
            ...error.actual,
            contenido: await descifrar(error.actual.contenido),
          })
        }
        throw error
      }
    },

    borrar(clave: Clave, versionEsperada: Version) {
      return interno.borrar(clave, versionEsperada)
    },

    listar() {
      return interno.listar()
    },
  }
}
