/**
 * ALMACÉN — el transporte
 * =============================================================================
 *
 * Esta interface es TODO lo que un backend tiene que implementar. Cinco métodos.
 * Drive, la nube cifrada y la copia local (IndexedDB) implementan esto y nada
 * más: no saben qué es una cuenta, ni una transacción, ni un presupuesto.
 *
 * POR QUÉ EL CONTENIDO ES `Uint8Array` Y NO UN OBJETO
 *
 * Porque el backend nube guarda texto cifrado. Si la interface hablara de JSON,
 * el cifrado tendría que vivir ADENTRO de cada backend: duplicado en dos lados
 * y, en el de Drive, ausente. Con bytes en el borde, el cifrado es un envoltorio
 * —`AlmacenCifrado` en cripto.ts— que se le puede poner a cualquiera de los tres
 * sin que ninguno se entere. También deja la puerta abierta a cifrar Drive más
 * adelante sin tocar una línea del transporte.
 *
 * POR QUÉ NO HAY `consultar()` NI NADA PARECIDO
 *
 * Relevamiento de los operadores que usa la app hoy contra PostgREST:
 *
 *     .eq 62   .order 22   .gte 7   .lte 5   .limit 4   .in 4   .lt/.gt/.is 3
 *     .or 0    .like 0     .range 0   .count 0
 *
 * Todo eso es `Array.prototype.filter` y `.sort` sobre una colección ya cargada
 * en memoria. Un query builder acá sería una capa para reimplementar mal lo que
 * JavaScript ya hace bien. Las consultas viven en las services, sobre arrays.
 *
 * CONTROL DE CONCURRENCIA
 *
 * No hay transacciones y no puede haberlas: son tres almacenes de documentos.
 * Lo único que existe es el bloqueo optimista por versión, y los tres backends
 * lo soportan de forma nativa:
 *
 *     Drive   ETag        →  PATCH con `If-Match: <etag>`        → 412
 *     Nube    bigint      →  `update ... where version = $n`     → 0 filas
 *     Local   contador    →  comparación dentro de la misma tx de IndexedDB
 *
 * Por eso `guardar()` exige siempre la versión que el llamador cree tener. No
 * hay forma de escribir "a lo que venga": es deliberado.
 */

/** Qué backend está detrás. Para mensajes de error y telemetría, nada más. */
/**
 * `relacional` es el andamio de la migracion, no un backend de verdad: son las
 * tablas de siempre vestidas de `Libro` para poder portar las services una sola
 * vez. Se va el dia que no quede nadie en ese modo. Ver relacional.ts.
 */
export type TipoDeAlmacen = 'drive' | 'nube' | 'local' | 'memoria' | 'relacional'

/**
 * Nombre de un bloque dentro del almacén. Es plano: no hay carpetas.
 * Ver `ClaveDeBloque` en documentos.ts para las claves que la app usa.
 */
export type Clave = string

/**
 * Token opaco de versión. Es un `string` para los tres backends aunque abajo
 * uno sea un ETag y otro un entero: quien lo recibe no lo interpreta NUNCA,
 * solo lo devuelve tal cual en el próximo `guardar()`.
 */
export type Version = string

/**
 * El `<ArrayBuffer>` explicito recorre TODA la interface y no es ceremonia:
 * desde TypeScript 5.7 `Uint8Array` a secas significa
 * `Uint8Array<ArrayBufferLike>`, que incluye `SharedArrayBuffer` y por eso no
 * es asignable al `BufferSource` que exige Web Crypto.
 *
 * Se arregla aca, en el tipo del modelo, y no con un cast en cada llamada:
 * ningun almacen guarda memoria compartida, asi que el tipo ancho era
 * simplemente incorrecto. Ademas evita una copia de ~400 kB por operacion, que
 * es lo que costaria normalizar el buffer en cada punto de uso.
 */
export type Bloque = {
  clave: Clave
  contenido: Uint8Array<ArrayBuffer>
  version: Version
}

/** Lo que devuelve `listar()`: metadatos sin bajar el contenido. */
export type ResumenDeBloque = {
  clave: Clave
  version: Version
  /**
   * Tamanio ALMACENADO, no el del contenido en claro.
   *
   * La diferencia aparece con `crearAlmacenCifrado()`: ahi cada bloque carga
   * un byte de version, doce de IV y dieciseis del tag de GCM, y el envoltorio
   * no puede informar el tamanio original sin descifrar todo — que es
   * justamente lo que `listar()` existe para evitar.
   *
   * Es el numero correcto igual, porque la pregunta que responde `listar()` es
   * "cuanto ocupa esto en la cuota del usuario", no "cuantos caracteres tiene
   * el JSON".
   */
  bytes: number
  /** ISO 8601. `null` si el backend no lo informa. */
  modificado: string | null
}

/**
 * Versión esperada al escribir:
 *
 *   - `Version`  → "pisá el bloque que está en esta versión" (update)
 *   - `null`     → "creá el bloque; fallá si ya existe"      (create)
 *
 * No existe la tercera opción de "escribí sin mirar". Si alguna vez hace falta,
 * se hace con un `obtener()` + `guardar()` explícito, para que quede escrito en
 * el código de quien decidió pisar.
 */
export type VersionEsperada = Version | null

export interface Almacen {
  readonly tipo: TipoDeAlmacen

  /** `null` si el bloque no existe. No lanza por bloque faltante. */
  obtener(clave: Clave): Promise<Bloque | null>

  /**
   * Escribe y devuelve el bloque con su versión nueva.
   * Lanza `ConflictoDeVersion` si `versionEsperada` no coincide con la actual.
   */
  guardar(
    clave: Clave,
    contenido: Uint8Array<ArrayBuffer>,
    versionEsperada: VersionEsperada
  ): Promise<Bloque>

  /** Lanza `ConflictoDeVersion` igual que `guardar()`. */
  borrar(clave: Clave, versionEsperada: Version): Promise<void>

  /** Todos los bloques del almacén. Lo usa el diagnóstico y la migración. */
  listar(): Promise<ResumenDeBloque[]>
}

// --- Errores -----------------------------------------------------------------
//
// Tipados y no strings, porque `Libro.mutar()` distingue el conflicto —que
// reintenta solo— del resto —que sube a la UI.

export class ConflictoDeVersion extends Error {
  readonly clave: Clave
  /**
   * El bloque tal como está ahora, SI el backend lo devolvió junto con el
   * rechazo. La nube puede (`returning *` en el update fallido); Drive no
   * (un 412 viene sin cuerpo). Cuando viene, `mutar()` se ahorra un GET.
   */
  readonly actual: Bloque | null

  constructor(clave: Clave, actual: Bloque | null = null) {
    super(`El bloque "${clave}" cambió desde que se leyó.`)
    this.name = 'ConflictoDeVersion'
    this.clave = clave
    this.actual = actual
  }
}

/**
 * Drive: la cuenta de Google del usuario está llena.
 * Nube: se pasó de la cuota del plan.
 *
 * Es el único error de escritura que el usuario puede resolver por su cuenta,
 * así que merece un mensaje propio en vez de un "no se pudo guardar".
 */
/**
 * Un error de backend que CONSERVA el codigo original.
 *
 * Sin esto, cruzar la interface pierde el codigo: PostgREST lo manda aparte
 * (`error.code`) y envolverlo en un `Error` pelado lo deja solo adentro del
 * mensaje. Cada chequeo tipo `if (error.code === '23505')` de las services
 * dejaba de matchear en silencio — el aviso no salia nunca y nadie se enteraba.
 * Ya paso una vez; esta clase existe para que no vuelva a pasar.
 */
export class ErrorDelAlmacen extends Error {
  constructor(
    mensaje: string,
    readonly codigo?: string
  ) {
    super(mensaje)
    this.name = 'ErrorDelAlmacen'
  }
}

/** El codigo de PostgREST de un error, venga envuelto o crudo. */
export function codigoDeError(error: unknown): string | undefined {
  if (error instanceof ErrorDelAlmacen) return error.codigo
  if (error && typeof error === 'object' && 'code' in error) {
    const codigo = (error as { code?: unknown }).code
    return typeof codigo === 'string' ? codigo : undefined
  }
  return undefined
}

export class AlmacenSinEspacio extends Error {
  constructor(readonly tipo: TipoDeAlmacen) {
    super('No hay espacio disponible para guardar.')
    this.name = 'AlmacenSinEspacio'
  }
}

/**
 * El permiso se cayó: el usuario revocó el acceso a Drive desde su cuenta de
 * Google, o la sesión venció. La app tiene que mandarlo a reconectar, no
 * reintentar.
 */
export class AlmacenNoAutorizado extends Error {
  constructor(readonly tipo: TipoDeAlmacen) {
    super('Se perdió el acceso al almacenamiento.')
    this.name = 'AlmacenNoAutorizado'
  }
}
