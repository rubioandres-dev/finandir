// Solo para el servidor: exceljs usa Buffer y streams de Node.
import ExcelJS from 'exceljs'
import type { Patrimonio } from './accounts-service'
import type { ResumenDeBalance } from './balance-overview'
import type { Traductor } from './i18n'
import type { ResumenDeInversiones } from './investments-service'
import type { PuntoMensual } from './monthly-flow'
import type {
  Cuenta,
  Inversion,
  Moneda,
  PlazoDeLiquidez,
  TipoDeActivo,
  TipoDeCuenta,
  Transaccion,
} from './types'

/**
 * Exportación a Excel.
 *
 * POR QUÉ NÚMEROS Y NO TEXTO YA FORMATEADO
 *
 * La tentación es escribir `formatearMonto(...)` en cada celda y que se vea
 * igual que en la app. No se hace: una celda con "$ 1.234,56" es una CADENA, y
 * una cadena no se suma, no se ordena por valor y no entra en una tabla
 * dinámica. Se exporta el número crudo con un `numFmt` encima, que es lo que
 * hace que Excel lo muestre bien Y lo siga tratando como número.
 *
 * POR QUÉ UNA COLUMNA "MONEDA" SEPARADA
 *
 * El formato de celda no puede depender de la fila. Con varias divisas, poner
 * el símbolo en el `numFmt` obligaría a un formato por fila o —peor— a asumir
 * que todo es pesos. La divisa va en su propia columna: además de ser correcto,
 * deja filtrar y agrupar por ella, que es justamente lo que uno quiere hacer con
 * un libro multi-moneda.
 */

/** Paleta AUREM llevada a ARGB, que es lo que entiende exceljs. */
const NEGRO = 'FF0A0C14'
const ORO = 'FFF2CA4F'
const GRIS_SUAVE = 'FF1A1C26'
const BLANCO_HUESO = 'FFF5F0E6'

const FORMATO_NUMERO = '#,##0.00'
const FORMATO_PORCENTAJE = '0.00"%"'

export type DatosDeExportacion = {
  idioma: Traductor
  /** Divisa de expresión de los KPI unificados: la activa del header. */
  moneda: Moneda
  balance: ResumenDeBalance
  patrimonio: Patrimonio
  inversiones: ResumenDeInversiones
  activos: Inversion[]
  cuentas: Cuenta[]
  movimientos: Transaccion[]
  categorias: { id: string; name: string }[]
  flujoMensual: PuntoMensual[]
  /** Cuándo se generó, en ISO. Lo pasa la ruta: acá no se lee el reloj. */
  generadoEn: string
}

/** Encabezado de tabla: fondo negro AUREM con el texto en oro. */
function estilarEncabezado(fila: ExcelJS.Row) {
  fila.font = { bold: true, size: 10, color: { argb: ORO } }
  fila.alignment = { vertical: 'middle' }
  fila.height = 22

  fila.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NEGRO } }
    celda.border = { bottom: { style: 'thin', color: { argb: ORO } } }
  })
}

/** Título de hoja: una línea sobria arriba de todo. */
function agregarTitulo(hoja: ExcelJS.Worksheet, texto: string, columnas: number) {
  hoja.mergeCells(1, 1, 1, columnas)
  const celda = hoja.getCell(1, 1)
  celda.value = texto
  celda.font = { bold: true, size: 14, color: { argb: ORO } }
  celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NEGRO } }
  celda.alignment = { vertical: 'middle' }
  hoja.getRow(1).height = 30
}

/** Una tarjeta de KPI: rótulo arriba, número abajo. */
function agregarKpi(
  hoja: ExcelJS.Worksheet,
  fila: number,
  columna: number,
  rotulo: string,
  valor: number | null,
  moneda: Moneda
) {
  const celdaRotulo = hoja.getCell(fila, columna)
  celdaRotulo.value = rotulo
  celdaRotulo.font = { size: 9, color: { argb: 'FF9A9486' } }

  const celdaValor = hoja.getCell(fila + 1, columna)
  if (valor === null) {
    // Un KPI sin cotización no se exporta como 0: sería un dato inventado.
    celdaValor.value = 's/ cotización'
    celdaValor.font = { italic: true, size: 11, color: { argb: 'FF9A9486' } }
  } else {
    celdaValor.value = valor
    celdaValor.numFmt = FORMATO_NUMERO
    celdaValor.font = { bold: true, size: 13, color: { argb: BLANCO_HUESO } }
  }

  const celdaMoneda = hoja.getCell(fila + 2, columna)
  celdaMoneda.value = moneda
  celdaMoneda.font = { size: 8, color: { argb: ORO } }

  for (const f of [fila, fila + 1, fila + 2]) {
    hoja.getCell(f, columna).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: GRIS_SUAVE },
    }
  }
}

// --- Hoja 1 · Dashboard ------------------------------------------------------

function hojaDashboard(libro: ExcelJS.Workbook, datos: DatosDeExportacion) {
  const t = datos.idioma
  const hoja = libro.addWorksheet('Dashboard', {
    properties: { defaultColWidth: 18 },
    views: [{ showGridLines: false }],
  })

  agregarTitulo(hoja, `AUREM · ${t('balance.patrimonioTotal')}`, 5)

  hoja.getCell(2, 1).value = `Generado: ${datos.generadoEn.slice(0, 10)}`
  hoja.getCell(2, 1).font = { size: 9, color: { argb: 'FF9A9486' } }

  // --- KPIs, en una fila de tarjetas ---------------------------------------
  const { balance } = datos
  agregarKpi(hoja, 4, 1, t('balance.patrimonioTotal'), balance.patrimonioNeto, datos.moneda)
  agregarKpi(hoja, 4, 2, t('balance.liquidezHoy'), balance.liquidez.total, datos.moneda)
  agregarKpi(hoja, 4, 3, t('balance.tarjetas'), balance.tarjetas.total, datos.moneda)
  agregarKpi(hoja, 4, 4, t('balance.inversiones'), balance.inversiones.total, datos.moneda)

  const ingresosDelAnio = datos.flujoMensual.reduce((suma, p) => suma + p.ingresos, 0)
  const gastosDelAnio = datos.flujoMensual.reduce((suma, p) => suma + p.gastos, 0)
  agregarKpi(hoja, 8, 1, t('dashboard.ingresos'), Math.round(ingresosDelAnio * 100) / 100, datos.moneda)
  agregarKpi(hoja, 8, 2, t('dashboard.gastos'), Math.round(gastosDelAnio * 100) / 100, datos.moneda)
  agregarKpi(
    hoja,
    8,
    3,
    'Neto',
    Math.round((ingresosDelAnio - gastosDelAnio) * 100) / 100,
    datos.moneda
  )

  // --- Desglose mensual -----------------------------------------------------
  const filaEncabezado = 13
  hoja.getCell(filaEncabezado - 1, 1).value = t('evolutivo.titulo')
  hoja.getCell(filaEncabezado - 1, 1).font = { bold: true, size: 11, color: { argb: ORO } }

  const encabezados = ['Mes', t('dashboard.ingresos'), t('dashboard.gastos'), 'Neto', t('comun.moneda')]
  encabezados.forEach((texto, indice) => {
    hoja.getCell(filaEncabezado, indice + 1).value = texto
  })
  estilarEncabezado(hoja.getRow(filaEncabezado))

  datos.flujoMensual.forEach((punto, indice) => {
    const fila = hoja.getRow(filaEncabezado + 1 + indice)
    fila.getCell(1).value = punto.mes
    fila.getCell(2).value = punto.ingresos
    fila.getCell(3).value = punto.gastos
    fila.getCell(4).value = punto.neto
    fila.getCell(5).value = datos.moneda

    for (const columna of [2, 3, 4]) fila.getCell(columna).numFmt = FORMATO_NUMERO

    // El neto en rojo cuando el mes cerró en pérdida: es la lectura que uno
    // busca al recorrer la columna con el ojo.
    if (punto.neto < 0) fila.getCell(4).font = { color: { argb: 'FFE05260' } }
  })

  hoja.getColumn(1).width = 14
  return hoja
}

// --- Hoja 2 · Movimientos ----------------------------------------------------

function hojaMovimientos(libro: ExcelJS.Workbook, datos: DatosDeExportacion) {
  const t = datos.idioma
  const hoja = libro.addWorksheet('Movimientos', { views: [{ state: 'frozen', ySplit: 2 }] })

  const columnas = [
    { header: t('comun.fecha'), key: 'fecha', width: 12 },
    { header: t('comun.descripcion'), key: 'descripcion', width: 38 },
    { header: t('objetivos.tipoCampo'), key: 'tipo', width: 14 },
    { header: t('objetivos.categoria'), key: 'categoria', width: 20 },
    { header: t('comun.cuenta'), key: 'cuenta', width: 22 },
    { header: t('comun.moneda'), key: 'moneda', width: 10 },
    { header: t('comun.importe'), key: 'importe', width: 16 },
    { header: t('comun.cuotas'), key: 'cuotas', width: 12 },
  ]

  agregarTitulo(hoja, `AUREM · ${t('mov.titulo')}`, columnas.length)

  hoja.columns = columnas.map((c) => ({ key: c.key, width: c.width }))

  const filaEncabezado = hoja.getRow(2)
  columnas.forEach((columna, indice) => {
    filaEncabezado.getCell(indice + 1).value = columna.header
  })
  estilarEncabezado(filaEncabezado)

  const nombreDeCategoria = new Map(datos.categorias.map((c) => [c.id, c.name]))
  const nombreDeCuenta = new Map(datos.cuentas.map((c) => [c.id, c.name]))

  datos.movimientos.forEach((movimiento, indice) => {
    const fila = hoja.getRow(3 + indice)

    fila.getCell(1).value = movimiento.date
    fila.getCell(2).value = movimiento.description ?? ''
    fila.getCell(3).value = t(`tipoMov.${movimiento.type}`)
    fila.getCell(4).value = movimiento.category_id
      ? (nombreDeCategoria.get(movimiento.category_id) ?? '')
      : ''
    fila.getCell(5).value = nombreDeCuenta.get(movimiento.account_id) ?? ''
    fila.getCell(6).value = movimiento.currency
    fila.getCell(7).value = Number(movimiento.amount)
    fila.getCell(7).numFmt = FORMATO_NUMERO

    // El "badge" de cuotas: 3/12 se lee de un vistazo y ordena bien. Vacío
    // cuando es un pago único, para que la columna no sea una pared de "1/1".
    fila.getCell(8).value =
      movimiento.installment_total && movimiento.installment_total > 1
        ? `${movimiento.installment_current ?? 1}/${movimiento.installment_total}`
        : ''

    if (movimiento.installment_total && movimiento.installment_total > 1) {
      fila.getCell(8).font = { bold: true, color: { argb: ORO } }
    }

    fila.getCell(7).font = {
      color: { argb: movimiento.type === 'INCOME' ? 'FF10B981' : 'FFE05260' },
    }
  })

  // Lo que pedía el requerimiento: filtros en los encabezados. El rango tiene
  // que empezar en la fila 2, que es donde están los títulos de columna —la 1
  // es el título de la hoja, y meterla adentro rompe el filtro.
  hoja.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: Math.max(2, datos.movimientos.length + 2), column: columnas.length },
  }

  return hoja
}

// --- Hoja 3 · Cuentas --------------------------------------------------------

/** Cómo se comporta el saldo de cada tipo de cuenta. */
function clasificarCuenta(tipo: TipoDeCuenta, esLiquida: boolean): string {
  if (tipo === 'CREDIT_CARD') return 'Deuda a vencer'
  if (tipo === 'INVESTMENT') return 'Inversión'
  return esLiquida ? 'Líquido' : 'No líquido'
}

function hojaCuentas(libro: ExcelJS.Workbook, datos: DatosDeExportacion) {
  const t = datos.idioma
  const hoja = libro.addWorksheet('Cuentas', { views: [{ state: 'frozen', ySplit: 2 }] })

  const columnas = [
    { header: t('comun.nombre'), width: 28 },
    { header: t('objetivos.tipoCampo'), width: 18 },
    { header: t('comun.moneda'), width: 10 },
    { header: 'Saldo', width: 16 },
    { header: 'Clasificación', width: 18 },
  ]

  agregarTitulo(hoja, `AUREM · ${t('cuentas.titulo')}`, columnas.length)

  columnas.forEach((columna, indice) => {
    hoja.getColumn(indice + 1).width = columna.width
    hoja.getCell(2, indice + 1).value = columna.header
  })
  estilarEncabezado(hoja.getRow(2))

  datos.cuentas.forEach((cuenta, indice) => {
    const fila = hoja.getRow(3 + indice)
    const saldo = Number(cuenta.balance ?? 0)

    fila.getCell(1).value = cuenta.name
    fila.getCell(2).value = t(`tipoCuenta.${cuenta.type}`)
    fila.getCell(3).value = cuenta.currency.trim()
    // En tarjeta el saldo es negativo (es deuda) y así se exporta: darlo vuelta
    // haría que la columna no sume el patrimonio.
    fila.getCell(4).value = saldo
    fila.getCell(4).numFmt = FORMATO_NUMERO
    if (saldo < 0) fila.getCell(4).font = { color: { argb: 'FFE05260' } }
    fila.getCell(5).value = clasificarCuenta(cuenta.type, cuenta.is_liquid)
  })

  hoja.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: Math.max(2, datos.cuentas.length + 2), column: columnas.length },
  }

  // --- Totales por moneda ---------------------------------------------------
  const primeraLibre = datos.cuentas.length + 4
  hoja.getCell(primeraLibre, 1).value = t('cuentas.liquido')
  hoja.getCell(primeraLibre, 1).font = { bold: true, color: { argb: ORO } }

  datos.patrimonio.liquido.forEach(({ moneda, valor }, indice) => {
    const fila = hoja.getRow(primeraLibre + 1 + indice)
    fila.getCell(1).value = moneda
    fila.getCell(2).value = valor
    fila.getCell(2).numFmt = FORMATO_NUMERO
  })

  return hoja
}

// --- Hoja 4 · Inversiones ----------------------------------------------------

/**
 * Agrupa los activos como los lee un humano.
 *
 * No es lo mismo que `liquidity_term`: cripto no es un plazo de rescate, pero
 * es la categoría con la que se piensa la cartera. Se muestran las dos cosas,
 * en columnas distintas.
 */
function clasificarActivo(tipo: TipoDeActivo, plazo: PlazoDeLiquidez): string {
  if (tipo === 'CRYPTO') return 'Cripto'
  if (tipo === 'REAL_ESTATE') return 'Inmuebles'
  if (plazo === 'T0') return 'T+0 · disponible hoy'
  if (plazo === 'T1') return 'T+1'
  if (plazo === 'LOCKED') return 'Inmovilizado'
  return 'T+2'
}

function hojaInversiones(libro: ExcelJS.Workbook, datos: DatosDeExportacion) {
  const t = datos.idioma
  const hoja = libro.addWorksheet('Inversiones', { views: [{ state: 'frozen', ySplit: 2 }] })

  const columnas = [
    { header: t('comun.nombre'), width: 28 },
    { header: t('inv.tipoDeActivo'), width: 20 },
    { header: 'Clasificación', width: 20 },
    { header: t('inv.liquidez'), width: 18 },
    { header: t('comun.moneda'), width: 10 },
    { header: t('inv.montoInvertido'), width: 16 },
    { header: t('inv.valorActual'), width: 16 },
    { header: 'Resultado', width: 16 },
    { header: 'TNA', width: 10 },
  ]

  agregarTitulo(hoja, `AUREM · ${t('nav.inversiones')}`, columnas.length)

  columnas.forEach((columna, indice) => {
    hoja.getColumn(indice + 1).width = columna.width
    hoja.getCell(2, indice + 1).value = columna.header
  })
  estilarEncabezado(hoja.getRow(2))

  datos.activos.forEach((activo, indice) => {
    const fila = hoja.getRow(3 + indice)
    const invertido = Number(activo.amount_invested ?? 0)
    const actual = Number(activo.current_value ?? 0)
    const resultado = actual - invertido

    fila.getCell(1).value = activo.name
    fila.getCell(2).value = t(`tipoActivo.${activo.asset_type}`)
    fila.getCell(3).value = clasificarActivo(activo.asset_type, activo.liquidity_term)
    fila.getCell(4).value = t(`liquidez.${activo.liquidity_term}`)
    fila.getCell(5).value = (activo.currency ?? 'ARS').trim()
    fila.getCell(6).value = invertido
    fila.getCell(7).value = actual
    fila.getCell(8).value = Math.round(resultado * 100) / 100
    fila.getCell(9).value = Number(activo.expected_tna ?? 0)

    for (const columna of [6, 7, 8]) fila.getCell(columna).numFmt = FORMATO_NUMERO
    fila.getCell(9).numFmt = FORMATO_PORCENTAJE
    fila.getCell(8).font = { color: { argb: resultado < 0 ? 'FFE05260' : 'FF10B981' } }
  })

  hoja.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: Math.max(2, datos.activos.length + 2), column: columnas.length },
  }

  // --- TNA promedio ponderada de lo líquido, por moneda ---------------------
  const primeraLibre = datos.activos.length + 4
  hoja.getCell(primeraLibre, 1).value = `${t('inv.ponderado')} · TNA`
  hoja.getCell(primeraLibre, 1).font = { bold: true, color: { argb: ORO } }

  Object.entries(datos.inversiones.tnaLiquida).forEach(([moneda, tna], indice) => {
    const fila = hoja.getRow(primeraLibre + 1 + indice)
    fila.getCell(1).value = moneda
    if (tna === null) {
      // Sin activos líquidos en esa moneda no hay promedio que informar. Un 0
      // se leería como "rinden cero", que es otra cosa.
      fila.getCell(2).value = '—'
    } else {
      fila.getCell(2).value = tna
      fila.getCell(2).numFmt = FORMATO_PORCENTAJE
    }
  })

  return hoja
}

/**
 * Arma el libro completo. Devuelve el buffer listo para responder.
 *
 * `as ArrayBuffer` en el retorno: los tipos de exceljs declaran `Buffer` de
 * Node, pero `Response` de la Web API quiere un `ArrayBuffer`/`Uint8Array`. En
 * runtime es lo mismo —un Buffer ES un Uint8Array— y el cast evita copiar el
 * archivo entero para satisfacer al compilador.
 */
export async function construirLibro(datos: DatosDeExportacion): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook()
  libro.creator = 'AUREM'
  libro.created = new Date(datos.generadoEn)

  hojaDashboard(libro, datos)
  hojaMovimientos(libro, datos)
  hojaCuentas(libro, datos)
  hojaInversiones(libro, datos)

  return (await libro.xlsx.writeBuffer()) as ArrayBuffer
}
