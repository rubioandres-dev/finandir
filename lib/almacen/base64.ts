/**
 * Base64 sobre bytes, a prueba de bloques grandes.
 *
 * Vive aparte porque lo usan el cifrado y el backend nube: uno para las
 * envolturas de la DEK, el otro porque PostgREST transporta los bloques como
 * texto. Duplicarlo sería duplicar las dos trampas que tiene.
 */

/**
 * De a un byte y NO con spread: `String.fromCharCode(...bytes)` revienta con
 * "Maximum call stack size exceeded" apenas el bloque pasa las ~100 kB, que es
 * un shard de movimientos de un año normal. Lo aprendio el POC a los golpes.
 */
export function aBase64(bytes: Uint8Array): string {
  let binario = ''
  for (const byte of bytes) binario += String.fromCharCode(byte)
  return btoa(binario)
}

/**
 * El `<ArrayBuffer>` explicito no es decorativo: desde TypeScript 5.7
 * `Uint8Array` a secas significa `Uint8Array<ArrayBufferLike>`, que incluye
 * `SharedArrayBuffer` y por eso NO es asignable al `BufferSource` que pide Web
 * Crypto. Sin el parametro, ninguna llamada a `subtle` compila.
 */
export function desdeBase64(texto: string): Uint8Array<ArrayBuffer> {
  const binario = atob(texto)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i)
  return bytes
}
