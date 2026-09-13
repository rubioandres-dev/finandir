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
 * `crearLibro()` VS `abrirLibro()`
 *
 * `crearLibro()` devuelve el libro y nada más: sirve para tests y para cuando ya
 * se sabe que el almacén está sano. `abrirLibro()` además lee el manifiesto,
 * corre las migraciones de esquema y REANUDA lo que haya quedado a medio hacer.
 * En la app se usa siempre `abrirLibro()`; dejar entrar a alguien a leer datos
 * sin haber terminado un borrado a medias es exactamente el bug que el diario
 * existe para evitar.
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

/** Reintentos de una escritura que perdió la carrera. Ver `escribir()`. */
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
   *
   * ORDEN GARANTIZADO: por fecha descendente y, a igual fecha, por
   * `created_at` descendente. Lo mas nuevo primero.
   *
   * La garantia esta en la interface y no en cada implementacion porque sin
   * ella se cuela un bug silencioso: el backend relacional ordena en SQL y el
   * de documentos devolveria el orden de insercion del shard. Las dos listas
   * tienen los mismos elementos y se ven distintas, asi que cualquier service
   * que muestre "los ultimos" andaria bien en un modo y mal en el otro.
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

  /**
   * Igual que `mutar()`, sobre el shard de un año. Mismo contrato de pureza.
   *
   * Si el año todavía no tenía shard, lo registra en el manifiesto y le calcula
   * las aperturas desde el cierre del ejercicio anterior. Eso pasa acá y no en
   * quien llama porque olvidarse sería un saldo mal calculado y silencioso.
   */
  mutarMovimientos(
    anio: number,
    cambio: (actual: ShardDeMovimientos) => ShardDeMovimientos
  ): Promise<void>

  /** Los años que tienen shard, ascendente. */
  aniosConMovimientos(): Promise<number[]>

  // --- Escritura de movimientos: metodos ANGOSTOS ----------------------------
  //
  // `mutar()` recibe la coleccion entera y devuelve la coleccion entera. Para
  // el almacen de documentos es el modelo natural: el shard ya esta en memoria.
  // Sobre una tabla relacional es inviable —habria que diferenciar contra lo que
  // habia, o sea bajar y subir miles de filas por cada gasto nuevo—, y durante
  // toda la transicion los dos backends tienen que funcionar.
  //
  // Estos cuatro metodos existen para eso: cada backend los resuelve como mejor
  // sabe. Relacional los mapea a INSERT/UPDATE/DELETE directo; documentos, a una
  // mutacion del shard.

  /**
   * Deja el saldo de una cuenta EN `saldo`, hoy.
   *
   * No es "escribir la columna balance": en modo documentos el saldo se deriva
   * de los movimientos, asi que fijarlo es mover la APERTURA del ejercicio para
   * que la cuenta cierre en el numero pedido. El usuario dice "mi banco tiene
   * 50.000" y eso es lo que tiene que mostrar la app, sin inventar un
   * movimiento que el no hizo.
   */
  ajustarSaldo(cuentaId: string, saldo: number, alDia: string): Promise<void>

  /** Un movimiento por id, o `null` si no existe. */
  movimiento(id: string): Promise<Transaccion | null>

  /**
   * Agrega o reemplaza por id. Es un upsert a proposito: asi agregar es
   * idempotente y un reintento no duplica un plan de cuotas.
   */
  agregarMovimientos(movimientos: Transaccion[]): Promise<void>

  /**
   * Reemplaza un movimiento entero. Si le cambio el año a la fecha, se muda de
   * shard solo — eso en relacional es un UPDATE cualquiera y en documentos son
   * dos escrituras.
   */
  editarMovimiento(movimiento: Transaccion): Promise<void>

  /**
   * Borra el movimiento Y, si es la madre de un plan, todas sus cuotas.
   *
   * Replica el `on delete cascade` de `parent_transaction_id` (migracion 003).
   * En relacional lo hace Postgres; en documentos hay que hacerlo a mano, y
   * olvidarse dejaria cuotas huerfanas apuntando a un id que ya no existe.
   */
  borrarMovimiento(id: string): Promise<void>

  manifiesto(): Promise<Manifiesto>
  mutarManifiesto(cambio: (actual: Manifiesto) => Manifiesto): Promise<void>

  /**
   * Corre una operación que toca varios bloques, anotándola en el diario para
   * poder reanudarla si se corta. `ejecutar` tiene que ser IDEMPOTENTE: puede
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

/**
 * Cómo rehacer cada operación multi-bloque que quedó a medias. Se inyecta en
 * `abrirLibro()` en vez de importarse, para que el libro no dependa de las
 * operaciones y las operaciones puedan depender del libro.
 */
export type Replays = {
  [O in OperacionDiferida]?: (
    libro: Libro,
    parametros: Record<string, unknown>
  ) => Promise<void>
}

/**
 * De una versión de esquema a la siguiente. La clave es la versión DE ORIGEN:
 * `MIGRACIONES[1]` lleva un documento de la 1 a la 2.
 */
export type Migraciones = Record<
  number,
  (libro: Libro) => Promise<void>
>

// -----------------------------------------------------------------------------
// Serialización
// -----------------------------------------------------------------------------

const codificador = new TextEncoder()
const decodificador = new TextDecoder()

function codificar(valor: unknown): Uint8Array<ArrayBuffer> {
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

  const leerShard = (anio: number) => obtener(claveDeShard(anio), shardVacio(anio))

  const leerManifiesto = () => obtener(CLAVE_MANIFIESTO, manifiestoInicial)

  const escribirManifiesto = (cambio: (m: Manifiesto) => Manifiesto) =>
    escribir(CLAVE_MANIFIESTO, cambio, manifiestoInicial)

  /**
   * Saldo de cada cuenta al cierre de un ejercicio: su apertura más todo lo que
   * pasó ese año, cuotas futuras del mismo año incluidas.
   */
  async function saldosAlCierre(anio: number): Promise<Record<string, number>> {
    const shard = await leerShard(anio)
    const saldos: Record<string, number> = { ...shard.aperturas }

    for (const m of shard.movimientos) {
      const delta = m.type === 'INCOME' ? m.amount : -m.amount
      saldos[m.account_id] = (saldos[m.account_id] ?? 0) + delta
    }

    return saldos
  }

  /**
   * Le pone al shard de `anio` las aperturas que salen del cierre del ejercicio
   * anterior. Sin esto, un año nuevo arrancaría con todas las cuentas en cero y
   * el saldo que ve el usuario sería el del año corriente, no el real.
   *
   * El primer ejercicio de todos se queda con aperturas vacías, que es correcto:
   * antes de él no hay nada.
   */
  async function asegurarAperturas(anio: number): Promise<void> {
    const manifiesto = await leerManifiesto()
    const anteriores = manifiesto.shards.filter((a) => a < anio)
    if (anteriores.length === 0) return

    const cierre = await saldosAlCierre(Math.max(...anteriores))
    // `escribir` directo y no `mutarMovimientos`: si pasara por ahí volvería a
    // entrar al registro de shards y esto sería recursivo.
    await escribir(
      claveDeShard(anio),
      (s: ShardDeMovimientos) => ({ ...s, aperturas: cierre }),
      shardVacio(anio)
    )
  }

  const libro: Libro = {
    tipo: almacen.tipo,

    async leer(coleccion) {
      return obtener(coleccion, () => vacioDe(coleccion))
    },

    async movimientos(desde, hasta) {
      const shards = await Promise.all(
        shardsDelRango(desde, hasta).map((anio) => leerShard(anio))
      )

      return shards
        .flatMap((shard) => shard.movimientos)
        .filter((m) => m.date >= desde && m.date <= hasta)
        .sort(porFechaDescendente)
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
      const manifiesto = await leerManifiesto()
      const esNuevo = !manifiesto.shards.includes(anio)

      await escribir(claveDeShard(anio), cambio, shardVacio(anio))

      if (esNuevo) {
        await escribirManifiesto((m) =>
          m.shards.includes(anio)
            ? m
            : { ...m, shards: [...m.shards, anio].sort((a, b) => a - b) }
        )
        await asegurarAperturas(anio)
      }
    },

    async aniosConMovimientos() {
      return (await leerManifiesto()).shards
    },

    async ajustarSaldo(cuentaId, saldo, alDia) {
      const derivado = (await libro.saldos(alDia))[cuentaId] ?? 0
      const diferencia = saldo - derivado
      if (diferencia === 0) return

      // La apertura del PRIMER ejercicio: es el unico lugar donde se puede
      // fijar un saldo sin tocar ningun movimiento del usuario.
      const anios = await libro.aniosConMovimientos()
      const primero = anios.length > 0 ? Math.min(...anios) : shardDeFecha(alDia)

      await libro.mutarMovimientos(primero, (shard) => ({
        ...shard,
        aperturas: {
          ...shard.aperturas,
          [cuentaId]: (shard.aperturas[cuentaId] ?? 0) + diferencia,
        },
      }))
    },

    async movimiento(id) {
      for (const anio of (await leerManifiesto()).shards) {
        const encontrado = (await leerShard(anio)).movimientos.find((m) => m.id === id)
        if (encontrado) return encontrado
      }
      return null
    },

    async agregarMovimientos(movimientos) {
      const porAnio = new Map<number, Transaccion[]>()
      for (const m of movimientos) {
        const anio = shardDeFecha(m.date)
        porAnio.set(anio, [...(porAnio.get(anio) ?? []), m])
      }

      // Ascendente: los shards nuevos nacen en orden y heredan bien la apertura
      // del anterior.
      for (const anio of [...porAnio.keys()].sort((a, b) => a - b)) {
        const delAnio = porAnio.get(anio) ?? []
        const ids = new Set(delAnio.map((m) => m.id))
        await libro.mutarMovimientos(anio, (shard) => ({
          ...shard,
          // Se sacan los que vienen y se vuelven a poner: reemplazar por id es
          // lo que hace idempotente al agregado.
          movimientos: [...shard.movimientos.filter((m) => !ids.has(m.id)), ...delAnio],
        }))
      }
    },

    async editarMovimiento(movimiento) {
      const anterior = await libro.movimiento(movimiento.id)
      const anioNuevo = shardDeFecha(movimiento.date)

      await libro.agregarMovimientos([movimiento])

      // Si la fecha cambio de año, la version vieja quedo en el shard anterior.
      if (anterior && shardDeFecha(anterior.date) !== anioNuevo) {
        await libro.mutarMovimientos(shardDeFecha(anterior.date), (shard) => ({
          ...shard,
          movimientos: shard.movimientos.filter((m) => m.id !== movimiento.id),
        }))
      }
    },

    async borrarMovimiento(id) {
      // Las cuotas ANTES que la madre: un corte en el medio deja un plan con
      // menos cuotas, que se arregla repitiendo. Al reves dejaria cuotas
      // apuntando a una madre que ya no existe, que es corrupcion de verdad.
      for (const anio of (await leerManifiesto()).shards) {
        await libro.mutarMovimientos(anio, (shard) => ({
          ...shard,
          movimientos: shard.movimientos.filter((m) => m.parent_transaction_id !== id),
        }))
      }

      for (const anio of (await leerManifiesto()).shards) {
        await libro.mutarMovimientos(anio, (shard) => ({
          ...shard,
          movimientos: shard.movimientos.filter((m) => m.id !== id),
        }))
      }
    },

    manifiesto: leerManifiesto,
    mutarManifiesto: escribirManifiesto,

    async diferir(operacion, parametros, ejecutar) {
      const intencion: Intencion = {
        id: crypto.randomUUID(),
        operacion,
        parametros,
        iniciada: new Date().toISOString(),
        intentos: 1,
      }

      // Se anota ANTES de tocar nada. Si el proceso muere entre esta línea y el
      // final de `ejecutar`, el próximo `abrirLibro()` encuentra la intención y
      // la rehace (por eso `ejecutar` tiene que ser idempotente).
      await escribirManifiesto((m) => ({ ...m, pendiente: intencion }))

      await ejecutar()

      await escribirManifiesto((m) =>
        m.pendiente?.id === intencion.id ? { ...m, pendiente: null } : m
      )
    },

    invalidar() {
      cache.clear()
    },
  }

  return libro
}

// -----------------------------------------------------------------------------
// Apertura: migraciones y reanudación
// -----------------------------------------------------------------------------

export type OpcionesDeApertura = {
  replays?: Replays
  migraciones?: Migraciones
}

export class IntencionAtascada extends Error {
  constructor(readonly intencion: Intencion) {
    super(
      `La operación "${intencion.operacion}" falló ${intencion.intentos} veces y ` +
        'no se puede completar sola.'
    )
    this.name = 'IntencionAtascada'
  }
}

/**
 * Abre el almacén y lo deja en un estado consistente antes de devolverlo.
 *
 * En este orden, que importa:
 *
 *   1. Migraciones de esquema. Un replay escrito para el esquema nuevo no tiene
 *      por qué entender documentos viejos.
 *   2. Reanudación del diario. Recién después de esto hay datos que se puedan
 *      leer sin riesgo de ver un borrado a medio hacer.
 *
 * Si la intención pendiente ya agotó los intentos, LANZA en vez de seguir. Es
 * deliberado: una operación que falla siempre y de la que nadie se entera deja
 * el almacén roto para siempre, y en silencio.
 */
export async function abrirLibro(
  almacen: Almacen,
  opciones: OpcionesDeApertura = {}
): Promise<Libro> {
  const libro = crearLibro(almacen)
  const { replays = {}, migraciones = {} } = opciones

  let manifiesto = await libro.manifiesto()

  // --- 1. Migraciones de esquema ---------------------------------------------
  while (manifiesto.esquema < ESQUEMA_ACTUAL) {
    const migracion = migraciones[manifiesto.esquema]
    if (!migracion) {
      throw new Error(
        `No hay migración del esquema ${manifiesto.esquema} al ${manifiesto.esquema + 1}.`
      )
    }

    await migracion(libro)
    const desde = manifiesto.esquema
    await libro.mutarManifiesto((m) =>
      m.esquema === desde ? { ...m, esquema: desde + 1 } : m
    )
    manifiesto = await libro.manifiesto()
  }

  // --- 2. Reanudación del diario ---------------------------------------------
  const pendiente = manifiesto.pendiente
  if (pendiente) {
    if (pendiente.intentos >= MAX_INTENTOS_DE_INTENCION) {
      throw new IntencionAtascada(pendiente)
    }

    const replay = replays[pendiente.operacion]
    if (!replay) {
      throw new Error(
        `Quedó pendiente "${pendiente.operacion}" y no hay replay registrado para ella.`
      )
    }

    // Se cuenta el intento ANTES de correrlo. Si esta operación cuelga o
    // revienta el proceso, el próximo arranque ve el contador más alto y
    // termina rindiéndose en vez de reintentar para siempre.
    await libro.mutarManifiesto((m) =>
      m.pendiente?.id === pendiente.id
        ? { ...m, pendiente: { ...m.pendiente, intentos: m.pendiente.intentos + 1 } }
        : m
    )

    await replay(libro, pendiente.parametros)

    await libro.mutarManifiesto((m) =>
      m.pendiente?.id === pendiente.id ? { ...m, pendiente: null } : m
    )
  }

  return libro
}

/**
 * Lo mas nuevo primero. `created_at` desempata: dos gastos del mismo dia se
 * muestran en el orden en que se cargaron, y no al azar.
 */
function porFechaDescendente(a: Transaccion, b: Transaccion): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
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
