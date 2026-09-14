/**
 * LOS GASTOS COMPARTIDOS, CIFRADOS
 * =============================================================================
 *
 * `grupos.ts` hace la criptografía, `espacios.ts` reparte las llaves contra la
 * base. Esto es lo que va adentro del sobre: qué se cifra de un gasto, de un
 * pago y de un objetivo, y cómo se vuelve a armar del otro lado.
 *
 * QUÉ SE CIFRA
 *
 * Todo lo que dice algo de la plata: el importe, la descripción, la categoría y
 * el reparto. Queda en claro únicamente lo que el servidor necesita para hacer
 * su trabajo y no puede deducir nada con eso:
 *
 *   space_id            el filtro de la RLS; cifrado no habría permisos
 *   date                ordena y pagina del lado del servidor
 *   paid_by_member_id   FK con cascada, y decir "cargó algo" no es decir cuánto
 *   currency            agrupa saldos sin revelar importes
 *   generacion          con qué llave abrir: es metadato de la llave, no dato
 *
 * EL REPARTO VIAJA ADENTRO DEL GASTO
 *
 * Antes eran filas de `shared_splits`. Una fila por participante no se puede
 * cifrar por columna sin volver a tener el problema entero, así que el reparto
 * pasa a ser una lista dentro del payload. Cuesta algo: si se borra un miembro,
 * su id queda colgado adentro del texto cifrado, donde ninguna FK lo limpia.
 * Eso lo resuelve quien muestra, que es el único que puede leerlo.
 *
 * LAS FILAS VIEJAS SE LEEN IGUAL
 *
 * Un grupo con datos cargados antes de esto tiene filas en claro y sin sobre.
 * No se pueden cifrar desde el servidor —no tiene la llave— así que se leen
 * como están y las re-escribe el cliente cuando abre el grupo. Por eso cada
 * `abrir*` acepta las dos formas: no es compatibilidad por las dudas, es el
 * único camino por el que los datos existentes pueden llegar a estar cifrados.
 */

import { cifrarDelGrupo, descifrarDelGrupo } from './grupos'
import type {
  FotoDeCategoria,
  GastoCompartido,
  Liquidacion,
  ObjetivoDeGrupo,
  Reparto,
  TipoDeReparto,
} from '../shared-expenses-service'
import type { Moneda } from '../types'

/** Una fila tal como vuelve de PostgREST, sin interpretar. */
export type FilaCruda = Record<string, unknown>

// --- Gastos -------------------------------------------------------------------

/** Lo que el servidor no puede ver de un gasto. */
export type PayloadDeGasto = {
  monto: number
  descripcion: string
  /** Clave de agrupación opaca: sólo su dueño puede resolverla. */
  categoriaId: string | null
  categoria: FotoDeCategoria | null
  tipoDeReparto: TipoDeReparto
  repartos: Reparto[]
}

export function cifrarGasto(gek: CryptoKey, payload: PayloadDeGasto): Promise<string> {
  return cifrarDelGrupo(gek, payload)
}

/**
 * Arma el gasto desde la fila, venga cifrada o en claro.
 *
 * Devuelve también si estaba en claro, porque eso es lo que dispara el
 * re-cifrado. Sin ese dato habría que volver a mirar la fila afuera, y el
 * criterio quedaría escrito en dos lugares.
 */
export async function abrirGasto(
  gek: CryptoKey | null,
  fila: FilaCruda
): Promise<{ gasto: GastoCompartido; enClaro: boolean }> {
  const base = {
    id: fila.id as string,
    space_id: fila.space_id as string,
    paid_by_member_id: fila.paid_by_member_id as string,
    date: fila.date as string,
  }

  const cifrado = fila.payload_cifrado as string | null

  if (cifrado) {
    if (!gek) throw new Error('Falta la llave del grupo para abrir el gasto.')
    const p = await descifrarDelGrupo<PayloadDeGasto>(gek, cifrado)
    return {
      enClaro: false,
      gasto: {
        ...base,
        category_id: p.categoriaId,
        categoria: p.categoria,
        split_type: p.tipoDeReparto,
        amount: p.monto,
        description: p.descripcion,
        repartos: p.repartos,
      },
    }
  }

  return { enClaro: true, gasto: { ...base, ...enClaroDesdeLaFila(fila) } }
}

/** La forma vieja: columnas legibles y repartos en su propia tabla. */
function enClaroDesdeLaFila(fila: FilaCruda) {
  const nombre = fila.category_name as string | null | undefined

  return {
    category_id: (fila.category_id as string | null) ?? null,
    categoria: nombre
      ? {
          nombre,
          icono: (fila.category_icon as string | null) ?? null,
          color: (fila.category_color as string | null) ?? null,
        }
      : null,
    split_type: (fila.split_type as TipoDeReparto) ?? 'EQUAL',
    amount: Number(fila.amount ?? 0),
    description: (fila.description as string | null) ?? '',
    repartos: ((fila.shared_splits ?? []) as FilaCruda[]).map((s) => ({
      member_id: s.member_id as string,
      percentage: Number(s.percentage),
      amount_owed: Number(s.amount_owed),
      is_settled: Boolean(s.is_settled),
    })),
  }
}

/** El payload que le corresponde a un gasto ya abierto. Para re-cifrar lo viejo. */
export function payloadDelGasto(gasto: GastoCompartido): PayloadDeGasto {
  return {
    monto: gasto.amount,
    descripcion: gasto.description,
    categoriaId: gasto.category_id,
    categoria: gasto.categoria,
    tipoDeReparto: gasto.split_type,
    repartos: gasto.repartos,
  }
}

// --- Pagos --------------------------------------------------------------------

export type PayloadDePago = { monto: number; nota: string | null }

export function cifrarPago(gek: CryptoKey, payload: PayloadDePago): Promise<string> {
  return cifrarDelGrupo(gek, payload)
}

export async function abrirPago(
  gek: CryptoKey | null,
  fila: FilaCruda
): Promise<{ pago: Liquidacion; enClaro: boolean }> {
  const base = {
    id: fila.id as string,
    from_member_id: fila.from_member_id as string,
    to_member_id: fila.to_member_id as string,
    currency: fila.currency as Moneda,
    created_at: fila.created_at as string,
  }

  const cifrado = fila.payload_cifrado as string | null

  if (cifrado) {
    if (!gek) throw new Error('Falta la llave del grupo para abrir el pago.')
    const p = await descifrarDelGrupo<PayloadDePago>(gek, cifrado)
    return { enClaro: false, pago: { ...base, amount: p.monto, note: p.nota } }
  }

  return {
    enClaro: true,
    pago: {
      ...base,
      amount: Number(fila.amount ?? 0),
      note: (fila.note as string | null) ?? null,
    },
  }
}

export function payloadDelPago(pago: Liquidacion): PayloadDePago {
  return { monto: pago.amount, nota: pago.note }
}

// --- Objetivos ----------------------------------------------------------------

export type PayloadDeObjetivo = {
  titulo: string
  categoriaId: string | null
  categoria: FotoDeCategoria | null
  montoObjetivo: number
  aporteMensual: number | null
}

export function cifrarObjetivo(gek: CryptoKey, payload: PayloadDeObjetivo): Promise<string> {
  return cifrarDelGrupo(gek, payload)
}

export async function abrirObjetivo(
  gek: CryptoKey | null,
  fila: FilaCruda
): Promise<{ objetivo: ObjetivoDeGrupo; enClaro: boolean }> {
  const base = {
    id: fila.id as string,
    type: fila.type as ObjetivoDeGrupo['type'],
    target_date: (fila.target_date as string | null) ?? null,
    currency: fila.currency as Moneda,
  }

  const cifrado = fila.payload_cifrado as string | null

  if (cifrado) {
    if (!gek) throw new Error('Falta la llave del grupo para abrir el objetivo.')
    const p = await descifrarDelGrupo<PayloadDeObjetivo>(gek, cifrado)
    return {
      enClaro: false,
      objetivo: {
        ...base,
        title: p.titulo,
        category_id: p.categoriaId,
        categoria: p.categoria,
        target_amount: p.montoObjetivo,
        monthly_contribution: p.aporteMensual,
      },
    }
  }

  const nombre = fila.category_name as string | null | undefined

  return {
    enClaro: true,
    objetivo: {
      ...base,
      title: (fila.title as string | null) ?? '',
      category_id: (fila.category_id as string | null) ?? null,
      categoria: nombre
        ? {
            nombre,
            icono: (fila.category_icon as string | null) ?? null,
            color: (fila.category_color as string | null) ?? null,
          }
        : null,
      target_amount: Number(fila.target_amount ?? 0),
      monthly_contribution:
        fila.monthly_contribution === null || fila.monthly_contribution === undefined
          ? null
          : Number(fila.monthly_contribution),
    },
  }
}

export function payloadDelObjetivo(objetivo: ObjetivoDeGrupo): PayloadDeObjetivo {
  return {
    titulo: objetivo.title,
    categoriaId: objetivo.category_id,
    categoria: objetivo.categoria,
    montoObjetivo: objetivo.target_amount,
    aporteMensual: objetivo.monthly_contribution,
  }
}

// --- El espacio entero --------------------------------------------------------

export type EspacioCrudo = {
  gastos: FilaCruda[]
  liquidaciones: FilaCruda[]
  objetivos: FilaCruda[]
}

export type EspacioAbierto = {
  gastos: GastoCompartido[]
  liquidaciones: Liquidacion[]
  objetivos: ObjetivoDeGrupo[]
  /** Lo que todavía el servidor puede leer. Vacío = el grupo está cifrado entero. */
  pendientesDeCifrar: {
    gastos: string[]
    liquidaciones: string[]
    objetivos: string[]
  }
}

/**
 * Abre el espacio entero con la llave que corresponda a cada fila.
 *
 * `gekPorGeneracion` y no una sola clave: durante una rotación conviven filas
 * escritas con la llave vieja y con la nueva. Elegir "la última" y confiar
 * dejaría de abrir justo lo que estaba antes de que echaran a alguien.
 *
 * Una fila que no abre NO tumba el grupo: se saltea y su id queda afuera. Un
 * sobre roto es un gasto que no se ve; tirar acá sería un grupo que no se ve.
 */
export async function abrirEspacio(
  crudo: EspacioCrudo,
  gekPorGeneracion: Map<number, CryptoKey>
): Promise<EspacioAbierto> {
  const abierto: EspacioAbierto = {
    gastos: [],
    liquidaciones: [],
    objetivos: [],
    pendientesDeCifrar: { gastos: [], liquidaciones: [], objetivos: [] },
  }

  const generaciones = [...gekPorGeneracion.keys()]
  const ultima = generaciones.length > 0 ? Math.max(...generaciones) : 0

  /**
   * La llave con la que abrir esa fila, o `null` si no hace falta ninguna.
   *
   * Una fila SIN sobre está en claro y se lee sin llave: es lo que mantiene
   * andando a un grupo que todavía no fue cifrado, incluido el caso de un
   * miembro que entró antes de que nadie repartiera la primera llave.
   */
  function llaveDe(fila: FilaCruda): CryptoKey | null | undefined {
    if (!fila.payload_cifrado) return null
    const generacion = (fila.generacion as number | null) ?? ultima
    return gekPorGeneracion.get(generacion)
  }

  for (const fila of crudo.gastos) {
    const gek = llaveDe(fila)
    if (gek === undefined) continue
    try {
      const { gasto, enClaro } = await abrirGasto(gek, fila)
      abierto.gastos.push(gasto)
      if (enClaro) abierto.pendientesDeCifrar.gastos.push(gasto.id)
    } catch {
      /* Sobre que no abre: el gasto no se muestra, el grupo sí. */
    }
  }

  for (const fila of crudo.liquidaciones) {
    const gek = llaveDe(fila)
    if (gek === undefined) continue
    try {
      const { pago, enClaro } = await abrirPago(gek, fila)
      abierto.liquidaciones.push(pago)
      if (enClaro) abierto.pendientesDeCifrar.liquidaciones.push(pago.id)
    } catch {
      /* idem */
    }
  }

  for (const fila of crudo.objetivos) {
    const gek = llaveDe(fila)
    if (gek === undefined) continue
    try {
      const { objetivo, enClaro } = await abrirObjetivo(gek, fila)
      abierto.objetivos.push(objetivo)
      if (enClaro) abierto.pendientesDeCifrar.objetivos.push(objetivo.id)
    } catch {
      /* idem */
    }
  }

  return abierto
}
