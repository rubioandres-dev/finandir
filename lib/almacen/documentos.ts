/**
 * EL MODELO DE DOCUMENTOS
 * =============================================================================
 *
 * Qué bloques existen, qué hay adentro de cada uno y cómo se reparten las
 * transacciones. Este archivo no habla con ningún backend: describe la forma de
 * los datos y es idéntico para Drive, para la nube cifrada y para la copia
 * local. Es, literalmente, el esquema — el reemplazo de schema.sql.
 *
 * UN BLOQUE POR COLECCIÓN, NO UN JSON GIGANTE
 *
 * Un movimiento nuevo no puede obligar a reescribir el perfil, los objetivos y
 * las inversiones. Cada colección se lee y se escribe sola, y el conflicto de
 * concurrencia queda acotado a la colección que se tocó: dos pestañas pueden
 * guardar un gasto y editar el perfil a la vez sin pisarse.
 *
 * LAS TARJETAS Y LOS PRESUPUESTOS VAN EMBEBIDOS
 *
 * `credit_card_details` es 1:1 con la cuenta y `category_budgets` es 1:N chico
 * con la categoría. Separarlos serían dos viajes a Drive para reconstruir algo
 * que siempre se lee junto. En una base relacional la normalización se paga con
 * un join, que es barato; acá se paga con un round-trip de red, que no lo es.
 */

import type { PresupuestoDeCategoria } from '../category-budgets-service'
import type { EstadoDeModulos } from '../modules'
import type { Objetivo } from '../goals-service'
import type {
  Categoria,
  Cuenta,
  DetalleTarjeta,
  Deuda,
  Inversion,
  Transaccion,
  UserProfile,
} from '../types'
import type { Clave } from './tipos'

/**
 * Versión del esquema de documentos.
 *
 * Reemplaza a la numeración de `migrations/*.sql`. Subir este número obliga a
 * escribir su entrada en `MIGRACIONES` (libro.ts): al abrir el libro, todo
 * documento con `esquema` menor se migra en memoria y se reescribe.
 *
 * Esto es lo que jubila a los chequeos de `faltaLaTabla(PGRST205)` y
 * `faltaLaColumna(42703)` desparramados hoy por las services: con los datos en
 * un documento propio, "falta la migración" deja de ser un error de runtime que
 * hay que adivinar por el código de PostgREST y pasa a ser un número que se
 * compara al abrir.
 */
export const ESQUEMA_ACTUAL = 1

// --- Las colecciones ---------------------------------------------------------

/** Cuenta con su detalle de tarjeta embebido (null si no es tarjeta). */
export type CuentaGuardada = Omit<Cuenta, 'balance'> & {
  detalle: DetalleTarjeta | null
}

/**
 * Categoria con sus presupuestos por moneda embebidos.
 *
 * `is_custom` esta aca y no en `Categoria` porque el tipo de dominio nunca
 * siguio a la columna que agrego la 008, y la UI SI la lee: el modal separa las
 * que vinieron con la app —que no se pueden editar— de las que se armo el
 * usuario. Guardar la categoria "tal cual" perderia esa distincion y volveria
 * editables las siete del sistema.
 *
 * Es el tercer campo con la misma historia, despues de `active_modules` en el
 * perfil y el `user_id` de los presupuestos.
 */
export type CategoriaGuardada = Categoria & {
  is_custom: boolean
  presupuestos: PresupuestoDeCategoria[]
}

/**
 * `balance` NO se guarda: se deriva.
 *
 * Hoy lo mantiene el trigger `apply_transaction_to_balance`. Sin base de datos
 * no hay trigger, y un número persistido que nadie recalcula es un número que
 * en algún momento miente. Se deriva de las transacciones más la apertura del
 * ejercicio (ver `ShardDeMovimientos.aperturas`), que es como lo haría un libro
 * contable y no cuesta nada porque el shard ya está en memoria.
 */
/**
 * El perfil, con los modulos apagados adentro.
 *
 * `UserProfile` no incluye `active_modules` —la columna la agrego la 011 y el
 * tipo nunca la siguio—, asi que guardar el perfil "tal cual" perderia en
 * silencio cada switch que el usuario haya apagado.
 *
 * `storage_backend` NO esta aca y es a proposito: vive en Supabase siempre.
 * Hay que saber DONDE estan los datos antes de poder leerlos, asi que ese dato
 * no puede vivir adentro de los datos.
 */
export type PerfilGuardado = UserProfile & {
  active_modules: EstadoDeModulos
}

/**
 * Deuda con el vinculo al gasto que la origino (migracion 017).
 *
 * `Deuda` nunca tuvo la columna. Hoy solo se ESCRIBE —la calculadora de salidas
 * ata las cuentas por cobrar a su gasto— y todavia nadie la lee, pero perderla
 * al migrar cortaria esa trazabilidad para siempre y sin aviso.
 *
 * Cuarto campo con la misma historia, despues de `active_modules`, el `user_id`
 * de los presupuestos y el `is_custom` de las categorias.
 */
export type DeudaGuardada = Deuda & {
  source_transaction_id: string | null
}

export type Coleccion = {
  perfil: PerfilGuardado
  cuentas: CuentaGuardada[]
  categorias: CategoriaGuardada[]
  deudas: DeudaGuardada[]
  inversiones: Inversion[]
  objetivos: Objetivo[]
}

export type NombreDeColeccion = keyof Coleccion

export const COLECCIONES: NombreDeColeccion[] = [
  'perfil',
  'cuentas',
  'categorias',
  'deudas',
  'inversiones',
  'objetivos',
]

// --- Movimientos: el único que se reparte ------------------------------------

/**
 * Las transacciones son la única colección que crece sin techo, así que van
 * repartidas por año: `mov-2025`, `mov-2026`. El dashboard lee la ventana de
 * datos (`inicioDeLaVentanaDeDatos`), que en la práctica toca uno o dos shards.
 *
 * Con 2000 movimientos al año un shard ronda los 400 KB. Un solo bloque con
 * diez años adentro serían 4 MB que hay que bajar, descifrar y volver a subir
 * enteros para agregar un café.
 */
export type ShardDeMovimientos = {
  anio: number
  /**
   * Saldo de cada cuenta al 1 de enero de `anio`, por id de cuenta.
   *
   * ES LO QUE HACE QUE EL SHARDING FUNCIONE. Sin esto, derivar el saldo actual
   * obligaría a leer TODOS los shards desde el principio de los tiempos, y el
   * reparto no habría servido de nada. Con la apertura, el saldo de hoy es
   * `aperturas[cuenta]` más los deltas del shard corriente: un solo bloque.
   *
   * Lo escribe el cierre de ejercicio cuando nace el shard del año siguiente.
   */
  aperturas: Record<string, number>
  movimientos: Transaccion[]
}

/** La clave del bloque de un año: `mov-2026`. */
export function claveDeShard(anio: number): Clave {
  return `mov-${anio}`
}

/** El shard donde vive un movimiento, derivado de su fecha `YYYY-MM-DD`. */
export function shardDeFecha(fecha: string): number {
  const anio = Number(fecha.slice(0, 4))
  if (!Number.isInteger(anio) || anio < 1970 || anio > 3000) {
    throw new Error(`Fecha inválida para derivar el shard: "${fecha}"`)
  }
  return anio
}

/** Los shards que cubre un rango de fechas, en orden ascendente. */
export function shardsDelRango(desde: string, hasta: string): number[] {
  const primero = shardDeFecha(desde)
  const ultimo = shardDeFecha(hasta)
  if (ultimo < primero) return []
  return Array.from({ length: ultimo - primero + 1 }, (_, i) => primero + i)
}

// --- El manifiesto -----------------------------------------------------------

export const CLAVE_MANIFIESTO: Clave = 'manifiesto'

/**
 * El índice del almacén. Es lo primero que se lee y casi nunca se escribe.
 *
 * NO GUARDA LAS VERSIONES DE LOS DEMÁS BLOQUES, a propósito. Sería la tentación
 * obvia —un solo GET y ya sabés todo— y convertiría al manifiesto en el cuello
 * de botella: habría que reescribirlo en CADA guardado, y cada movimiento
 * competiría con cada otro por la misma versión. La versión de un bloque la
 * devuelve el backend al leerlo, que es donde corresponde.
 *
 * Acá va sólo lo que cambia poco: el esquema, la lista de shards (una vez al
 * año) y el diario.
 */
export type Manifiesto = {
  esquema: number
  creado: string
  /** Años con shard creado, ascendente. Evita un `listar()` en cada arranque. */
  shards: number[]
  /** Ver el diario, más abajo. `null` cuando no hay nada a medio hacer. */
  pendiente: Intencion | null
}

export function manifiestoInicial(): Manifiesto {
  return {
    esquema: ESQUEMA_ACTUAL,
    creado: new Date().toISOString(),
    shards: [],
    pendiente: null,
  }
}

// --- El diario: lo que reemplaza a las transacciones de Postgres -------------

/**
 * EL PROBLEMA
 *
 * Borrar una cuenta tiene que borrar también sus movimientos, que viven en N
 * shards distintos. Son N+1 escrituras y no hay forma de hacerlas atómicas:
 * ningún almacén de documentos lo permite. Si el proceso se corta en el medio,
 * queda basura a mitad de camino. En datos financieros eso no es aceptable.
 *
 * LA SOLUCIÓN, EN DOS PARTES
 *
 * 1. ORDEN SEGURO. Siempre se escriben los hijos primero y el padre al final.
 *    Un corte deja "una cuenta con menos movimientos", que es un estado feo
 *    pero coherente y que se arregla repitiendo. El orden inverso dejaría
 *    movimientos huérfanos apuntando a una cuenta que ya no existe, que es
 *    corrupción de verdad.
 *
 * 2. DIARIO DE INTENCIONES. Antes de empezar se escribe en el manifiesto QUÉ se
 *    va a hacer; al terminar se borra. Si al abrir el libro hay una intención
 *    pendiente, se reanuda antes de dejar que nadie lea.
 *
 * POR QUÉ GUARDA LA OPERACIÓN Y NO LOS BYTES
 *
 * Un WAL clásico guardaría el contenido nuevo de cada bloque. Acá eso serían
 * megabytes adentro del manifiesto. Se guarda el comando —"borrar la cuenta X"—
 * y cada operación se escribe de forma IDEMPOTENTE, así que rehacerla entera es
 * inofensivo. Es un log de comandos, no de páginas. Cuesta que toda operación
 * multi-bloque se piense para poder correr dos veces; a cambio, el diario pesa
 * 200 bytes en vez de megabytes.
 */
export type OperacionDiferida =
  | 'borrar-cuenta'
  | 'borrar-categoria'
  | 'guardar-plan-de-cuotas'
  | 'mover-movimiento-de-anio'
  | 'cerrar-ejercicio'

export type Intencion = {
  id: string
  operacion: OperacionDiferida
  /** Serializable. Lo interpreta el replay de su operación y nadie más. */
  parametros: Record<string, unknown>
  iniciada: string
  /** Cortafuegos: a los 3 intentos se para y se le avisa al usuario. */
  intentos: number
}

/** Máximo de reanudaciones antes de rendirse y pedir intervención. */
export const MAX_INTENTOS_DE_INTENCION = 3
