import type { CategoriaGuardada, CuentaGuardada } from './almacen/documentos'
import type { Libro } from './almacen/libro'
import { MONEDAS_POR_DEFECTO, nombreDeMoneda } from './monedas'
import { hoyEnArgentina, type Cuenta, type Moneda, type TipoCategoria } from './types'

// Este módulo tenía su propio `Moneda = 'ARS' | 'USD'`. Ahora reexporta el
// compartido: dos definiciones del mismo concepto es exactamente lo que hace
// que una se quede vieja cuando el usuario elige una tercera divisa.
export type { Moneda }

/** @deprecated Usá las divisas del perfil (`cargarContextoDeMonedas`). */
export const MONEDAS = MONEDAS_POR_DEFECTO

/**
 * Nombre de la cuenta que se crea sola para una moneda.
 *
 * Era un `Record` de dos entradas. Con divisas dinámicas tiene que responder
 * para cualquier código del catálogo, o la cuenta en euros se crearía con el
 * nombre `undefined`.
 */
export function nombreDeCuenta(moneda: Moneda): string {
  if (moneda === 'ARS') return 'Pesos'
  if (moneda === 'USD') return 'Dólares'
  return nombreDeMoneda(moneda)
}

/**
 * Devuelve la cuenta del usuario para esa moneda, creándola si hace falta.
 *
 * Cada moneda tiene su propia cuenta con su propio saldo: un gasto en dólares
 * nunca toca el saldo en pesos.
 *
 * POR QUÉ ESTO NO PUEDE USAR `maybeSingle()`
 *
 * Lo usaba, y era un bug. La versión original asumía UNA cuenta por moneda,
 * garantizada por el unique (user_id, currency) de migrations/002. Pero esa
 * misma migración lo DROPEA más abajo, justamente para que el módulo de
 * cuentas y tarjetas (003) pueda tener banco, efectivo y varias tarjetas en
 * pesos a la vez. La función nunca se actualizó.
 *
 * Con más de una cuenta en la moneda, `maybeSingle()` no devuelve la primera:
 * falla con PGRST116, "JSON object requested, multiple (or no) rows returned".
 * Lo disparaba cualquier alta sin cuenta explícita — el escáner de
 * comprobantes siempre, y el Smart Input cada vez que la IA no resolvía una.
 *
 * Ahora se elige una entre varias, con un criterio estable.
 */
export async function obtenerOCrearCuenta(
  libro: Libro,
  userId: string,
  moneda: Moneda
): Promise<{ cuentaId: string | null; error: string | null }> {
  // La captura por closure es el patron para sacar un resultado de `mutar()`,
  // que devuelve void. NO viola el contrato de repetibilidad: si hay conflicto,
  // `cambio` se vuelve a correr sobre los datos frescos y la ULTIMA asignacion
  // es la que queda. Lo prohibido es LEER estado de afuera, no escribirlo.
  let elegida: string | null = null

  try {
    await libro.mutar('cuentas', (cuentas) => {
      const candidata = elegirCuentaPorDefecto(cuentas, moneda)
      if (candidata) {
        elegida = candidata.id
        // Devolver el mismo array es una mutacion vacia: el adaptador
        // relacional no encuentra diferencias y no escribe nada.
        return cuentas
      }

      const nueva: CuentaGuardada = {
        id: crypto.randomUUID(),
        user_id: userId,
        name: nombreDeCuenta(moneda),
        type: 'BANK',
        currency: moneda,
        is_liquid: true,
        created_at: new Date().toISOString(),
        detalle: null,
      }
      elegida = nueva.id
      return [...cuentas, nueva]
    })
  } catch (error) {
    return {
      cuentaId: null,
      error: error instanceof Error ? error.message : 'No se pudo determinar la cuenta.',
    }
  }

  return { cuentaId: elegida, error: null }
}

/**
 * Cuenta destino cuando el movimiento no dice a cuál va.
 *
 * El orden importa y no es arbitrario:
 *
 *   1. Nunca una TARJETA DE CRÉDITO. Mandar ahí un gasto sin que nadie lo
 *      haya pedido genera deuda en silencio, que es el peor default posible.
 *   2. Entre las demás, primero las líquidas (banco, efectivo, billetera):
 *      son de donde sale la plata de un gasto común.
 *   3. A igualdad, la más vieja. Es la que el usuario viene usando, y elegir
 *      por fecha de creación hace que la misma cuenta gane siempre — un
 *      criterio inestable mandaría cada gasto a una cuenta distinta.
 */
function elegirCuentaPorDefecto(
  cuentas: CuentaGuardada[],
  moneda: Moneda
): CuentaGuardada | null {
  const deLaMoneda = [...cuentas]
    .filter((c) => c.currency === moneda)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const noTarjetas = deLaMoneda.filter((c) => c.type !== 'CREDIT_CARD')
  return noTarjetas.find((c) => c.is_liquid) ?? noTarjetas[0] ?? null
}

/**
 * Todas las cuentas del usuario, indexadas por moneda.
 *
 * El saldo sale de `libro.saldos()`: en relacional sigue siendo la columna que
 * mantiene el trigger, y en modo cifrado es un numero derivado de los
 * movimientos. Quien llama no nota la diferencia.
 */
export async function obtenerCuentasPorMoneda(
  libro: Libro
): Promise<{ cuentas: Record<string, Cuenta>; error: string | null }> {
  try {
    const [guardadas, saldos] = await Promise.all([
      libro.leer('cuentas'),
      libro.saldos(hoyEnArgentina()),
    ])

    const cuentas: Record<string, Cuenta> = {}
    for (const c of guardadas) {
      // Se indexa por moneda y la ultima gana, igual que antes: el modelo
      // asume una cuenta liquida por divisa.
      cuentas[c.currency] = {
        id: c.id,
        user_id: c.user_id,
        name: c.name,
        type: c.type,
        currency: c.currency,
        is_liquid: c.is_liquid,
        created_at: c.created_at,
        balance: saldos[c.id] ?? 0,
      }
    }
    return { cuentas, error: null }
  } catch (error) {
    return {
      cuentas: {},
      error: error instanceof Error ? error.message : 'No se pudieron leer las cuentas.',
    }
  }
}

/**
 * Resuelve el id de una categoría por nombre + tipo. Si no existe la crea:
 * la IA puede sugerir "Otros", que no viene en el seed de schema.sql.
 *
 * `name` es citext, así que la comparación ya es case-insensitive.
 */
export async function obtenerOCrearCategoria(
  libro: Libro,
  userId: string,
  nombre: string,
  tipo: TipoCategoria
): Promise<{ categoriaId: string | null; error: string | null }> {
  const limpio = nombre.trim()
  if (!limpio) return { categoriaId: null, error: null }

  let elegida: string | null = null

  try {
    await libro.mutar('categorias', (categorias) => {
      // Desde migrations/008 hay categorias globales (`user_id` nulo) que el
      // usuario tambien lee, asi que un mismo nombre puede traer dos. Gana la
      // propia: si alguien se armo su "Comida", es a la que quiere imputar.
      const mismoNombre = categorias.filter(
        (c) => c.name.trim().toLowerCase() === limpio.toLowerCase() && c.type === tipo
      )

      const existente = mismoNombre.find((c) => c.user_id === userId) ?? mismoNombre[0]
      if (existente) {
        elegida = existente.id
        return categorias
      }

      const nueva: CategoriaGuardada = {
        id: crypto.randomUUID(),
        user_id: userId,
        name: limpio,
        type: tipo,
        icon: 'circle',
        color: '#64748B',
        is_custom: true,
        presupuestos: [],
      }
      elegida = nueva.id
      return [...categorias, nueva]
    })
  } catch (error) {
    return {
      categoriaId: null,
      error: error instanceof Error ? error.message : 'No se pudo resolver la categoria.',
    }
  }

  return { categoriaId: elegida, error: null }
}