/**
 * EL LIBRO — la capa de dominio
 * =============================================================================
 *
 * Esto es lo que reciben las services. `Almacen` mueve bytes; `Libro` sabe qué
 * significan: resuelve los shards, deriva los saldos, reintenta los conflictos y
 * reanuda lo que quedó a medias.
 *
 * POR QUÉ DOS CAPAS Y NO UNA
 *
 * Porque si las services hablaran directo con el `Almacen`, cada backend nuevo
 * tendría que reimplementar el sharding, las cascadas y el reintento. Con el
 * corte acá, agregar un backend es escribir cinco métodos de transporte y nada
 * más. La lógica que puede corromper datos está escrita UNA vez y se testea UNA
 * vez, contra un almacén en memoria.
 *
 * CÓMO LO RECIBEN LAS SERVICES
 *
 * 13 de las 16 services de `lib/` ya reciben `supabase: SupabaseClient` por
 * parámetro. El port es cambiar ese parámetro por `libro: Libro`; la forma de
 * la función no cambia. Las 3 que crean el cliente adentro
 * —`dashboard-data.ts`, `currency-mode-server.ts`, `transactions-actions.ts`—
 * hay que abrirlas primero para que lo reciban.
 */

import {
  CLAVE_MANIFIESTO,
  claveDeShard,
  COLECCIONES,
  ESQUEMA_ACTUAL,
  manifiestoInicial,
  MAX_INTENTOS_DE_INTENCION,
  shardDeFecha,
  shardsDelRango,
  type Coleccion,
  type Intencion,
  type Manifiesto,
  type NombreDeColeccion,
  type OperacionDiferida,
  type ShardDeMovimientos,
} from './documentos'
import {
  ConflictoDeVersion,
  type Almacen,
  type Clave,
  type TipoDeAlmacen,
  type Version,
} from './tipos'
import type { Transaccion } from '../types'

/** Reintentos de una escritura que perdió la carrera. Ver `mutar()`. */
const MAX_REINTENTOS = 4

// -----------------------------------------------------------------------------
// La interface
// -----------------------------------------------------------------------------

export interface Libro {
  readonly tipo: TipoDeAlmacen

  /** Una colección entera. Filtrar y ordenar es cosa de quien llama. */
  leer<C extends NombreDeColeccion>(coleccion: C): Promise<Coleccion[C]>

  /**
   * Los movimientos de un rango de fechas, resolviendo los shards que haga
   * falta. Reemplaza al `.gte('date', x)` de PostgREST.
   */
  movimientos(desde: string, hasta: string): Promise<Transaccion[]>

  /**
   * Saldo derivado de cada cuenta al día `alDia`, por id de cuenta.
   * Reemplaza a la columna `accounts.balance` y a su trigger.
   */
  saldos(alDia: string): Promise<Record<string, number>>

  /**
   * Aplica un cambio a una colección y lo persiste.
   *
   * ═══ EL CONTRATO MÁS IMPORTANTE DE TODO EL DISEÑO ═══
   *
   * `cambio` TIENE QUE SER PURA Y REPETIBLE. Si otro dispositivo escribió entre
   * la lectura y la escritura, se la vuelve a llamar sobre los datos frescos.
   * Esto anda:
   *
   *     libro.mutar('cuentas', (cuentas) => [...cuentas, nueva])
   *
   * y esto rompe, porque el id se calcula una vez y el reintento lo repite
   * sobre un array que ya lo tiene:
   *
   *     const nueva = { id: crypto.randomUUID(), ... }   // ✗ afuera
   *     libro.mutar('cuentas', (cuentas) => [...cuentas, nueva])
   *
   * Regla práctica: todo lo que dependa del estado actual —ids, totales,
   * chequeos de unicidad— se calcula ADENTRO de `cambio`. Nada de mutar el
   * array recibido: devolvé uno nuevo.
   */
  mutar<C extends NombreDeColeccion>(
    coleccion: C,
    cambio: (actual: Coleccion[C]) => Coleccion[C]
  ): Promise<void>

  /** Igual que `mutar()`, sobre el shard de un año. Mismo contrato de pureza. */
  mutarMovimientos(
    anio: number,
    cambio: (actual: ShardDeMovimientos) => ShardDeMovimientos
  ): Promise<void>

  /**
   * Corre una operación que toca varios bloques, anotándola en el diario para
   * poder reanudarla si se corta. `ejecutar` tiene que ser idempotente: puede
   * correr dos veces. Ver el comentario del diario en documentos.ts.
   */
  diferir(
    operacion: OperacionDiferida,
    parametros: Record<string, unknown>,
    ejecutar: () => Promise<void>
  ): Promise<void>

  /** Tira el caché en memoria. Tras un cambio de backend o un logout. */
  invalidar(): void
}

// -----------------------------------------------------------------------------
// Serialización
// -----------------------------------------------------------------------------

const codificador = new TextEncoder()
const decodificador = new TextDecoder()

function codificar(valor: unknown): Uint8Array {
  return codificador.encode(JSON.stringify(valor))
}

function decodificar<T>(bytes: Uint8Array): T {
  return JSON.parse(decodificador.decode(bytes)) as T
}

// -----------------------------------------------------------------------------
// Implementación
// -----------------------------------------------------------------------------

type Entrada = { datos: unknown; version: Version }

/**
 * Caché en memoria, por bloque.
 *
 * Vive lo que vive la instancia: en el navegador, la pestaña; en el servidor,
 * el lambda. En SSR conviene envolver el `leer()` con `React.cache()` para
 * deduplicar dentro de un mismo request, que es donde más se nota (hoy
 * `cargarDatosDelDashboard` dispara cinco lecturas en paralelo).
 */
export function crearLibro(almacen: Almacen): Libro {
  const cache = new Map<Clave, Entrada>()

  async function obtener<T>(clave: Clave, vacio: () => T): Promise<T> {
    const enCache = cache.get(clave)
    if (enCache) return enCache.datos as T

    const bloque = await almacen.obtener(clave)
    if (!bloque) return vacio()

    const datos = decodificar<T>(bloque.contenido)
    cache.set(clave, { datos, version: bloque.version })
    return datos
  }

  /**
   * El lazo de bloqueo optimista. Es el corazón del diseño y el único lugar
   * donde se pueden perder datos si está mal.
   */
  async function escribir<T>(
    clave: Clave,
    cambio: (actual: T) => T,
    vacio: () => T
  ): Promise<void> {
    for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
      // Siempre contra el almacén, nunca contra el caché: el caché puede estar
      // viejo y acá se está por escribir.
      const bloque = await almacen.obtener(clave)
      const actual = bloque ? decodificar<T>(bloque.contenido) : vacio()

      const siguiente = cambio(actual)

      try {
        const guardado = await almacen.guardar(
          clave,
          codificar(siguiente),
          bloque?.version ?? null
        )
        cache.set(clave, { datos: siguiente, version: guardado.version })
        return
      } catch (error) {
        if (!(error instanceof ConflictoDeVersion)) throw error
        // Perdimos la carrera: alguien escribió en el medio. Se descarta lo
        // calculado y se vuelve a aplicar `cambio` sobre los datos de verdad.
        cache.delete(clave)
      }
    }

    throw new Error(
      `No se pudo guardar "${clave}": ${MAX_REINTENTOS} conflictos seguidos. ` +
        'Puede haber otro dispositivo escribiendo sin parar.'
    )
  }

  const shardVacio = (anio: number) => (): ShardDeMovimientos => ({
    anio,
    aperturas: {},
    movimientos: [],
  })

  async function leerShard(anio: number): Promise<ShardDeMovimientos> {
    return obtener(claveDeShard(anio), shardVacio(anio))
  }

  return {
    tipo: almacen.tipo,

    async leer(coleccion) {
      // TODO fase 3: correr MIGRACIONES cuando manifiesto.esquema < ESQUEMA_ACTUAL.
      return obtener(coleccion, () => vacioDe(coleccion))
    },

    async movimientos(desde, hasta) {
      const shards = await Promise.all(
        shardsDelRango(desde, hasta).map((anio) => leerShard(anio))
      )

      return shards
        .flatMap((shard) => shard.movimientos)
        .filter((m) => m.date >= desde && m.date <= hasta)
    },

    async saldos(alDia) {
      const shard = await leerShard(shardDeFecha(alDia))
      const saldos: Record<string, number> = { ...shard.aperturas }

      // Mismo criterio que el trigger `apply_transaction_to_balance` que esto
      // reemplaza: INCOME suma, EXPENSE y TRANSFER restan de la cuenta origen.
      for (const m of shard.movimientos) {
        // Las cuotas futuras de un plan ya existen como filas, pero todavía no
        // afectaron ningún saldo. Sin este corte, comprar en 12 cuotas
        // descontaría el total de una.
        if (m.date > alDia) continue
        const delta = m.type === 'INCOME' ? m.amount : -m.amount
        saldos[m.account_id] = (saldos[m.account_id] ?? 0) + delta
      }

      return saldos
    },

    async mutar(coleccion, cambio) {
      await escribir(coleccion, cambio, () => vacioDe(coleccion))
    },

    async mutarMovimientos(anio, cambio) {
      await escribir(claveDeShard(anio), cambio, shardVacio(anio))
      // TODO fase 3: si el shard es nuevo, agregarlo a `manifiesto.shards` y
      // disparar 'cerrar-ejercicio' para escribirle las aperturas.
    },

    async diferir(operacion, parametros, ejecutar) {
      const intencion: Intencion = {
        id: crypto.randomUUID(),
        operacion,
        parametros,
        iniciada: new Date().toISOString(),
        intentos: 1,
      }

      // Se anota ANTES de tocar nada. Si el proceso muere entre esta línea y el
      // final de `ejecutar`, el próximo arranque encuentra la intención y la
      // rehace (por eso `ejecutar` tiene que ser idempotente).
      await escribir<Manifiesto>(
        CLAVE_MANIFIESTO,
        (m) => ({ ...m, pendiente: intencion }),
        manifiestoInicial
      )

      await ejecutar()

      await escribir<Manifiesto>(
        CLAVE_MANIFIESTO,
        (m) => (m.pendiente?.id === intencion.id ? { ...m, pendiente: null } : m),
        manifiestoInicial
      )
    },

    invalidar() {
      cache.clear()
    },
  }
}

/** El valor de una colección que todavía no tiene bloque. */
function vacioDe<C extends NombreDeColeccion>(coleccion: C): Coleccion[C] {
  if (coleccion === 'perfil') {
    // El perfil se crea en el alta con sus defaults; no hay "perfil vacío"
    // razonable que inventar acá.
    throw new Error('Falta el perfil: el alta no terminó.')
  }
  return [] as unknown as Coleccion[C]
}

// -----------------------------------------------------------------------------
// Pendiente de las fases siguientes
// -----------------------------------------------------------------------------

/**
 * TODO fase 3 — `abrirLibro(almacen)`: lee el manifiesto, corre las migraciones
 * de esquema y reanuda `manifiesto.pendiente` ANTES de devolver el libro. Hasta
 * `MAX_INTENTOS_DE_INTENCION` veces; después avisa y no deja seguir.
 */
export const REANUDAR_PENDIENTE_SIN_IMPLEMENTAR = {
  MAX_INTENTOS_DE_INTENCION,
  ESQUEMA_ACTUAL,
  COLECCIONES,
} as const
