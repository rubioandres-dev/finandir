/**
 * CIFRADO — un envoltorio, no un backend
 * =============================================================================
 *
 * `AlmacenCifrado` implementa `Almacen` y recibe otro `Almacen` adentro. Cifra
 * al escribir y descifra al leer; el de abajo nunca ve texto claro y no se
 * entera de que existe el cifrado.
 *
 * Por eso el contenido de `Almacen` es `Uint8Array`. Si fueran objetos JSON, el
 * cifrado tendría que vivir adentro del backend nube, duplicado y ausente en
 * los otros dos. Así se compone:
 *
 *     crearLibro(new AlmacenCifrado(new AlmacenNube(...), claves))
 *     crearLibro(new AlmacenDrive(...))                        // sin cifrar
 *     crearLibro(new AlmacenCifrado(new AlmacenDrive(...), c)) // si algún día
 *
 * EL MODELO DE CLAVES: DEK ENVUELTA
 *
 * Hay DOS claves y esto no es adorno:
 *
 *     DEK  clave aleatoria de 256 bits. Es la que cifra los datos.
 *     KEK  derivada de la contraseña. Lo único que hace es envolver a la DEK.
 *
 * La DEK se guarda cifrada por la KEK. Cambiar la contraseña re-envuelve 32
 * bytes; si los datos colgaran directo de la contraseña, cambiarla obligaría a
 * bajar, descifrar, re-cifrar y subir años de movimientos — desde el navegador,
 * sin poder cortar por la mitad. Ese es el error clásico y es irreversible una
 * vez que hay usuarios.
 *
 * La misma DEK se envuelve una segunda vez con un CÓDIGO DE RECUPERACIÓN que el
 * usuario anota cuando activa el modo. Es la única red contra "me olvidé la
 * contraseña": sin eso, olvidarla es perder todo, igual que borrar la carpeta
 * de Drive.
 *
 * QUÉ SE FILTRA IGUAL — decirlo, no esconderlo
 *
 * El servidor no puede leer los datos, pero sí ve los nombres de los bloques y
 * su tamaño. De ahí se deduce que existe `mov-2026` y, por el peso, el orden de
 * magnitud de cuántos movimientos hay. No se filtran importes, descripciones ni
 * fechas. Es aceptable, pero no se promete lo que no se cumple: no es "cero
 * conocimiento", es "cero contenido".
 */

import type { Almacen } from './tipos'

/**
 * Lo que se guarda en Supabase junto al usuario. NADA de esto es secreto: son
 * las dos envolturas de la DEK más los parámetros para rehacer la KEK. Sin la
 * contraseña o el código de recuperación no sirven para nada.
 */
export type SobreDeClaves = {
  version: 1
  /** DEK cifrada con la KEK de la contraseña. Base64. */
  dekPorContrasena: string
  /** La misma DEK cifrada con la KEK del código de recuperación. Base64. */
  dekPorRecuperacion: string
  /** Sal del KDF, 16 bytes. Base64. Distinta por usuario. */
  sal: string
  kdf: 'PBKDF2-SHA256'
  /**
   * Iteraciones del KDF. Se guarda el número usado, no una constante del
   * código: subirlo en el futuro no puede romper los sobres ya escritos.
   */
  iteraciones: number
  creado: string
}

/**
 * PBKDF2 y no Argon2id, para empezar.
 *
 * Argon2id es mejor —resiste GPU y ASIC, PBKDF2 no— pero WebCrypto no lo trae y
 * habría que sumar un wasm de ~100 KB al bundle. PBKDF2-SHA256 con 600.000
 * iteraciones es lo que recomienda OWASP hoy, corre nativo y tarda ~300 ms en
 * un teléfono de gama media, que es tolerable UNA vez por sesión.
 *
 * `SobreDeClaves.kdf` está tipado como unión de un solo miembro justamente para
 * que migrar a Argon2id sea agregar un miembro y un `if`, sin tocar los sobres
 * viejos.
 */
export const ITERACIONES_PBKDF2 = 600_000

/** AES-GCM de 256 bits, con IV aleatorio de 12 bytes por bloque. */
export const ALGORITMO = 'AES-GCM' as const

/**
 * Formato de un bloque cifrado en disco:
 *
 *     [ 1 byte  versión de formato ]
 *     [ 12 bytes IV aleatorio      ]
 *     [ resto: ciphertext + tag    ]
 *
 * El IV se genera por CADA escritura. Repetir un IV con la misma clave en
 * AES-GCM no filtra "un poco": rompe la autenticación del cifrado. Va adelante
 * y en claro, que es lo correcto y lo esperado.
 */
export const VERSION_DE_FORMATO = 1
export const BYTES_DE_IV = 12

export type Claves = {
  /** La DEK ya desenvuelta, no exportable, viva sólo en memoria. */
  dek: CryptoKey
}

/**
 * TODO fase 5. La firma queda fijada acá porque es lo que el resto del diseño
 * asume; el cuerpo se escribe cuando se implemente el backend nube.
 *
 *   - derivarKek(contrasena, sal, iteraciones): Promise<CryptoKey>
 *   - crearSobre(contrasena): Promise<{ sobre, codigoDeRecuperacion }>
 *   - abrirSobre(sobre, secreto): Promise<Claves>
 *   - rotarContrasena(sobre, vieja, nueva): Promise<SobreDeClaves>
 *
 * `AlmacenCifrado` no necesita más que `Claves`: recibe la DEK ya abierta y no
 * sabe nada de contraseñas. Que el manejo de secretos no se mezcle con el de
 * bytes es a propósito — son dos cosas que se testean distinto.
 */
export declare function crearAlmacenCifrado(
  interno: Almacen,
  claves: Claves
): Almacen
