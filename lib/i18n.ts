/**
 * Idioma de la interfaz.
 *
 * IDIOMA Y REGIÓN SON DOS COSAS DISTINTAS
 *
 * La REGIÓN (`lib/formatters.ts`, migración 009) define cómo se escriben los
 * números y las fechas: `$ 1.234,56 · 10/09/2026` o `$1,234.56 · 09/10/2026`.
 * El IDIOMA define en qué lengua está el texto. No son lo mismo y no se
 * deducen uno del otro: un español que vive en Buenos Aires quiere formato
 * es-AR y texto sin voseo, y esa combinación no existe si hay una sola opción.
 *
 * POR QUÉ es-AR Y es SON DOS IDIOMAS Y NO UNO
 *
 * No es solo el voseo. La app está escrita para un contexto donde la inflación
 * es el problema central: habla de dólar MEP, de días de cierre de tarjeta, de
 * "lucas". Nada de eso significa algo para alguien en México o en España. El
 * neutro no es el argentino con los verbos cambiados: es el mismo consejo sin
 * las referencias que solo aplican acá.
 *
 * QUÉ ESTÁ TRADUCIDO Y QUÉ NO
 *
 * Cubierto: navegación (header, barra inferior, bandeja "Más"), dashboard,
 * presupuestos, objetivos y Tier, ajustes de idioma y región, el modal de
 * confirmación de localización, y la guía de uso completa —esta última con
 * contenido propio por idioma en `lib/guide-content.ts`.
 *
 * NO cubierto todavía: los formularios profundos de cuentas, movimientos,
 * inversiones, deudas, el importador de resúmenes y el editor de movimientos.
 * Son varios cientos de cadenas de microcopy y están en español en los tres
 * idiomas. `t()` devuelve la clave si falta una traducción, así que lo que
 * falte se ve pero no rompe.
 */

export type Idioma = 'es-AR' | 'es' | 'en'

export const IDIOMA_POR_DEFECTO: Idioma = 'es-AR'

export const CATALOGO_IDIOMAS: {
  codigo: Idioma
  nombre: string
  bandera: string
  detalle: string
}[] = [
  {
    codigo: 'es-AR',
    nombre: 'Español (Argentina)',
    bandera: '🇦🇷',
    detalle: 'Voseo y contexto local: MEP, cuotas, inflación',
  },
  {
    codigo: 'es',
    nombre: 'Español neutro',
    bandera: '🌎',
    detalle: 'Sin voseo, finanzas generales',
  },
  { codigo: 'en', nombre: 'English', bandera: '🇺🇸', detalle: 'Standard translation' },
]

const CODIGOS = new Set<string>(CATALOGO_IDIOMAS.map((i) => i.codigo))

export function normalizarIdioma(valor: string | null | undefined): Idioma {
  const codigo = valor?.trim()
  return codigo && CODIGOS.has(codigo) ? (codigo as Idioma) : IDIOMA_POR_DEFECTO
}

export function nombreDeIdioma(idioma: Idioma): string {
  return CATALOGO_IDIOMAS.find((i) => i.codigo === idioma)?.nombre ?? idioma
}

/**
 * Diccionario base, en es-AR.
 *
 * Las claves son jerárquicas y planas (`nav.inicio`) en vez de objetos
 * anidados: así el tipo `Clave` sale solo del objeto y TypeScript marca
 * cualquier clave inventada en el momento de escribirla.
 */
const ES_AR = {
  // --- Navegación -----------------------------------------------------------
  'nav.inicio': 'Inicio',
  'nav.cuentas': 'Cuentas',
  'nav.movimientos': 'Movimientos',
  'nav.inversiones': 'Inversiones',
  'nav.mas': 'Más',
  'nav.masSecciones': 'Más secciones',
  'nav.fire': 'Calculadora FIRE',
  'nav.fireDetalle': 'Cuánto falta para vivir de tus inversiones',
  'nav.calendario': 'Calendario',
  'nav.calendarioDetalle': 'Cierres y vencimientos del mes',
  'nav.deudas': 'Deudas y préstamos',
  'nav.deudasDetalle': 'Lo que debés y lo que te deben',
  'nav.gastoInteligente': 'Gasto inteligente',
  'nav.gastoInteligenteDetalle': 'Contado con descuento o cuotas',
  'nav.consolidado': 'Vista consolidada',
  'nav.consolidadoDetalle': 'Todas tus divisas en un solo total',
  'nav.guia': 'Guía de uso',
  'nav.guiaDetalle': 'Cómo sacarle jugo a AUREM',
  'nav.ajustes': 'Ajustes y perfil',
  'nav.ajustesDetalle': 'Divisas, región, presupuestos y cuenta',
  'nav.objetivos': 'Objetivos y Tier AUREM',
  'nav.objetivosDetalle': 'Tus metas y los logros que desbloqueás',

  // --- Ajustes --------------------------------------------------------------
  'ajustes.idioma': 'Idioma de la interfaz',
  'ajustes.idiomaAyuda':
    'Cambia el texto de la app. La región, que define el formato de números y fechas, se elige aparte.',
  'ajustes.region': 'Región y formato',
  'ajustes.guardando': 'Guardando…',
  'ajustes.guardado': 'Guardado',

  // --- Modal de confirmación de localización --------------------------------
  'localizacion.titulo': '¿Confirmar cambio de localización?',
  'localizacion.cuerpo':
    'La interfaz, los formatos y las guías de uso se van a actualizar a {destino}.',
  'localizacion.confirmar': 'Confirmar',
  'localizacion.cancelar': 'Cancelar',

  // --- Objetivos ------------------------------------------------------------
  'objetivos.titulo': 'Objetivos',
  'objetivos.bajada':
    'Metas con número. Cada una que cumplís suma XP y sube tu Tier: acá no se penaliza el gasto, se reconoce el logro.',
  'objetivos.nuevo': 'Nuevo objetivo',
  'objetivos.sinObjetivos': 'Todavía no definiste ninguna meta.',
  'objetivos.logrado': 'Logrado',
  'objetivos.enProgreso': 'En progreso',
  'objetivos.meta': 'Meta',
  'objetivos.actual': 'Actual',
  'objetivos.guardar': 'Guardar objetivo',
  'objetivos.borrar': 'Borrar',
  'objetivos.tipo.SAVINGS_RATE': 'Tasa de ahorro mensual',
  'objetivos.tipo.INVESTMENT_RATE': 'Inversión sobre ingresos',
  'objetivos.tipo.EMERGENCY_FUND': 'Fondo de emergencia',
  'objetivos.tipo.CATEGORY_BUDGET': 'Presupuesto por categoría',
  'objetivos.tipo.DEBT_REDUCTION': 'Reducción de deuda',
  'objetivos.ayuda.SAVINGS_RATE':
    'Qué porcentaje de lo que entra querés que quede sin gastar cada mes.',
  'objetivos.ayuda.INVESTMENT_RATE':
    'Qué porcentaje de tus ingresos querés destinar a inversiones.',
  'objetivos.ayuda.EMERGENCY_FUND':
    'Cuántos meses de tus gastos querés tener cubiertos con plata líquida.',
  'objetivos.ayuda.CATEGORY_BUDGET': 'Techo de gasto mensual para una categoría.',
  'objetivos.ayuda.DEBT_REDUCTION': 'A cuánto querés bajar tu deuda total.',
  'objetivos.unidad.porcentaje': '% de los ingresos',
  'objetivos.unidad.meses': 'meses de gastos',
  'objetivos.unidad.monto': 'monto',

  // --- Tier -----------------------------------------------------------------
  'tier.titulo': 'Tier AUREM',
  'tier.xp': 'XP',
  'tier.siguiente': 'Faltan {xp} XP para {tier}',
  'tier.maximo': 'Llegaste al tier más alto.',
  // --- Dashboard ------------------------------------------------------------
  'dashboard.balance': 'Balance total',
  'dashboard.sinMovimientos': 'Sin movimientos todavía',
  'dashboard.ingresos': 'Ingresos',
  'dashboard.gastos': 'Gastos',
  'dashboard.esteMes': 'Este mes',
  'dashboard.recientes': 'Movimientos recientes',
  'dashboard.verTodos': 'Ver todos',
  'dashboard.sinRegistrar': 'Todavía no registraste movimientos.',
  'dashboard.sinRegistrarPista': 'Escribí o dictá uno arriba y la IA lo carga por vos.',
  'dashboard.comoSacarleJugo': 'Cómo sacarle jugo',
  'dashboard.verGuia': 'Ver guía completa',
  'dashboard.cotizaciones': 'Cotizaciones del mercado',
  'dashboard.verTodasLasCotizaciones': 'Ver todas las cotizaciones (MEP, Blue, CCL...)',
  'dashboard.actualizado': 'Actualizado {fecha} hs',
  'dashboard.sinCotizaciones':
    'No se pudieron obtener las cotizaciones. Se reintenta en el próximo refresco.',
  'dashboard.errorCarga': 'Hubo un problema al cargar tus datos: {error}',

  // --- Presupuestos ---------------------------------------------------------
  'presupuestos.titulo': 'Presupuestos por categoría',
  'presupuestos.sinObjetivos':
    'Todavía no definiste presupuestos. Cargá uno como objetivo y lo vas a ver acá.',
  'presupuestos.cargar': '+ Cargar objetivo de presupuesto',
  'presupuestos.deLimite': 'de',
  'presupuestos.excedido': 'Excedido por {monto}',
  'presupuestos.quedan': 'Quedan {monto}',

  // --- Carga dual de objetivos ----------------------------------------------
  'objetivos.porMonto': 'Monto',
  'objetivos.porPorcentaje': 'Porcentaje',
  'objetivos.equivale': 'Equivale a {monto} por mes',
  'objetivos.equivalePorcentaje': 'Equivale al {porcentaje}% de tus ingresos',
  'objetivos.sinIngresos': 'Cargá algún ingreso del mes para ver el equivalente en dinero.',
  'objetivos.deudaActual': 'Tu deuda total hoy es {monto}.',
  'objetivos.sinDeuda': 'Hoy no tenés deuda registrada.',
  'objetivos.equivaleDeuda': 'Equivale a bajar la deuda a {monto}.',
  'objetivos.gastoPromedio':
    'Tu gasto promedio mensual es {monto}. Este monto cubre {meses} meses de costo de vida.',
  'objetivos.sinGasto': 'Todavía no hay gastos del mes para estimar cuántos meses cubre.',
  'objetivos.cancelar': 'Cancelar',
  'objetivos.categoria': 'Categoría',
  'objetivos.elegiUna': 'Elegí una…',
  'objetivos.tipoCampo': 'Tipo',
  'objetivos.reclamar': 'Reclamar {xp} XP',
  'objetivos.cumplisteUno': '¡Cumpliste un objetivo!',
  'objetivos.cumplisteVarios': '¡Cumpliste {cantidad} objetivos!',
  'objetivos.xpQueda':
    'Sumás {xp} XP. Una vez reclamado, el logro queda: no se pierde aunque el mes que viene no lo repitas.',

  // --- Comunes --------------------------------------------------------------
  'comun.guardar': 'Guardar',
  'comun.cancelar': 'Cancelar',
  'comun.cerrar': 'Cerrar',
  'comun.borrar': 'Borrar',
  'comun.editar': 'Editar',
  'comun.confirmar': 'Confirmar',
  'comun.guardando': 'Guardando…',
  'comun.moneda': 'Moneda',
  'comun.fecha': 'Fecha',
  'comun.importe': 'Importe',
  'comun.cuenta': 'Cuenta',
  'comun.cuotas': 'Cuotas',
  'comun.descripcion': 'Descripción',
  'comun.enMoneda': 'en {moneda}',

  // --- Módulos y gastos compartidos -----------------------------------------
  'nav.compartidos': 'Gastos compartidos',
  'nav.compartidosDetalle': 'Grupos, repartos y quién le debe a quién',
  'modulos.titulo': 'Módulos de la aplicación',
  'modulos.fijo': 'Módulo central fijo',
  'modulos.ayuda':
    'Apagar un módulo lo saca de la navegación y del inicio. No borra nada: los datos quedan y vuelven si lo prendés de nuevo.',
  'modulos.faltaMigracion':
    'Falta ejecutar migrations/011_shared_expenses_and_modules.sql en el SQL Editor de Supabase.',
  'modulos.cuentasDetalle': 'Bancos, billeteras, efectivo y tarjetas',
  'modulos.movimientosDetalle': 'Ingresos, gastos y transferencias',
  'modulos.inversionesDetalle': 'Cartera, rendimiento y liquidez',
  'modulos.cuotas': 'Saldo comprometido',
  'modulos.cuotasDetalle': 'Planes de cuotas y curva a 12 meses',

  'compartidos.titulo': 'Gastos compartidos',
  'compartidos.bajada':
    'Grupos donde varios ponen plata. Cada gasto tiene un pagador y un reparto: la app calcula quién le debe a quién.',
  'compartidos.nuevoGrupo': 'Crear nuevo grupo',
  'compartidos.escanear': 'Escanear QR de invitación',
  'compartidos.sinGrupos': 'Todavía no tenés grupos. Creá uno o sumate con un QR.',
  'compartidos.miembros': '{cantidad} miembros',
  'compartidos.mostrarQr': 'Mostrar QR de invitación',
  'compartidos.qrAyuda':
    'Que lo escaneen con la cámara del teléfono. También sirve compartir el enlace.',
  'compartidos.copiarEnlace': 'Copiar enlace',
  'compartidos.copiado': 'Enlace copiado',
  'compartidos.unirse': 'Unirme al grupo',
  'compartidos.yaSosMiembro': 'Ya sos parte de este grupo.',
  'compartidos.nuevoGasto': 'Cargar gasto',
  'compartidos.pagadoPor': 'Pagó',
  'compartidos.reparto': 'Reparto',
  'compartidos.partesIguales': 'Partes iguales',
  'compartidos.sinGastos': 'Todavía no hay gastos en este grupo.',
  'compartidos.saldar': 'Saldar cuentas',
  'compartidos.balanceCero': 'Están a mano: nadie le debe nada a nadie.',
  'compartidos.leDebe': '{deudor} le debe {monto} a {acreedor}',
  'compartidos.tuBalance': 'Tu balance',
  'compartidos.teDeben': 'Te deben',
  'compartidos.debes': 'Debés',
  'compartidos.totalGrupo': 'Total del grupo',
  'compartidos.sumaCien': 'El reparto tiene que sumar 100%. Ahora suma {suma}%.',

  'calculadora.titulo': 'Calculadora de salidas',
  'calculadora.bajada': 'Dividí la cuenta y, si querés, registrá el gasto como corresponde.',
  'calculadora.total': 'Total de la cuenta',
  'calculadora.personas': 'Cantidad de personas',
  'calculadora.propina': 'Propina y adicionales',
  'calculadora.porPersona': 'Por persona',
  'calculadora.conPropina': 'Total con propina',
  'calculadora.comoRegistrar': '¿Cómo lo registramos?',
  'calculadora.opcionA': 'Pagué el total',
  'calculadora.opcionADetalle':
    'Registra el egreso completo de tu cuenta, imputa tu parte como gasto y deja el resto como algo que te deben. Cuando te transfieran, cancelás esa deuda sin inflar tus ingresos.',
  'calculadora.opcionB': 'Solo mi parte',
  'calculadora.opcionBDetalle':
    'Registra únicamente tu cuota parte. Se asume que los demás pagaron lo suyo en el momento.',
  'calculadora.registrar': 'Registrar',
  'calculadora.registrado': 'Listo, quedó registrado.',
  'calculadora.descripcion': 'Descripción',

  // --- Movimientos ----------------------------------------------------------
  'mov.titulo': 'Movimientos',
  'mov.mesActual': 'Mes actual',
  'mov.cuotasFuturas': 'Cuotas futuras',
  'mov.anteriores': 'Anteriores',
  'mov.periodo': 'Período del historial',
  'mov.sinEsteMes': 'Todavía no registraste movimientos en {moneda} este mes.',
  'mov.sinFuturas': 'No tenés cuotas pendientes de meses que vengan.',
  'mov.sinAnteriores': 'No hay movimientos en {moneda} de meses anteriores.',
  'mov.categorias': 'Categorías',
  'mov.editar': 'Editar movimiento',
  'mov.dejarComoEsta': 'Dejar como está',
  'mov.guardarCambios': 'Guardar cambios',
  'mov.borrarMovimiento': 'Borrar movimiento',
  'mov.confirmarBorrado': 'Confirmar borrado',
  'mov.editarNombre': 'Editar {nombre}',

  // --- Cuentas, deudas, cuotas, consolidado, FIRE, inversiones ---------------
  'cuentas.titulo': 'Cuentas y tarjetas',
  'cuentas.liquido': 'Líquido',
  'cuentas.deudaTarjetas': 'Deuda en tarjetas',
  'cuentas.patrimonioNeto': 'Patrimonio neto',
  'cuentas.formula': 'Líquido + inversiones + por cobrar − tarjetas − deudas',
  'cuentas.carteraYRendimiento': 'Cartera y rendimiento',
  'cuentas.importarResumen': 'Importar resumen',
  'cuentas.sinCuentas': 'Todavía no tenés cuentas en {moneda}.',
  'cuentas.enMoneda': 'Cuentas en {moneda}',

  'deudas.titulo': 'Deudas y préstamos',
  'deudas.meDeben': 'Me deben',
  'deudas.debo': 'Debo',

  'cuotas.sinPendientes': 'Sin cuotas pendientes',
  'cuotas.porMesConVencimientos': 'Por mes con vencimientos',
  'cuotas.primerMesLibre': 'Primer mes sin vencimientos',

  'consolidado.cuentasYBilleteras': 'Cuentas y billeteras',
  'consolidado.inversiones': 'Inversiones',
  'consolidado.meDeben': 'Me deben',
  'consolidado.deudaTarjetas': 'Deuda de tarjetas',
  'consolidado.deudasPersonales': 'Deudas personales',
  'consolidado.neto': 'Neto',
  'consolidado.liquidezTotal': 'Liquidez total',
  'consolidado.pasivosTotales': 'Pasivos totales',

  'fire.gastoDelMes': 'Gasto del mes',
  'fire.promedioMensual': 'Promedio mensual',
  'fire.capitalObjetivo': 'Capital objetivo · regla del 4%',

  'inv.ponderado': 'Ponderado sobre lo líquido',
  'inv.rescatableHoy': 'Rescatable hoy (T+0)',
  'inv.asistenteDeGasto': 'Asistente de gasto',

  'ajustes.titulo': 'Ajustes',
  'ajustes.cuenta': 'Cuenta',
  'ajustes.categoriasContador': 'Categorías',
  'ajustes.periodoActual': 'Período actual',
  'ajustes.cotizacion': 'Cotización',
  'ajustes.sinCotizacion': 'No se pudo obtener la cotización.',

  'tier.comoFunciona':
    'Cada objetivo que cumplís por primera vez suma XP, y el XP no baja nunca. Un mes flojo no te saca un logro que ya conseguiste.',
} as const

export type Clave = keyof typeof ES_AR

/** Traducciones parciales: lo que falte cae a es-AR. */
type Parcial = Partial<Record<Clave, string>>

const ES_NEUTRO: Parcial = {
  'nav.deudasDetalle': 'Lo que debes y lo que te deben',
  'nav.gastoInteligenteDetalle': 'Contado con descuento o en cuotas',
  'nav.guiaDetalle': 'Cómo aprovechar AUREM',
  'nav.objetivosDetalle': 'Tus metas y los logros que desbloqueas',

  'ajustes.idiomaAyuda':
    'Cambia el texto de la app. La región, que define el formato de números y fechas, se elige por separado.',

  'localizacion.cuerpo':
    'La interfaz, los formatos y las guías de uso se actualizarán a {destino}.',

  'objetivos.bajada':
    'Metas con número. Cada una que cumples suma XP y sube tu Tier: aquí no se penaliza el gasto, se reconoce el logro.',
  'objetivos.sinObjetivos': 'Aún no has definido ninguna meta.',
  'objetivos.ayuda.SAVINGS_RATE':
    'Qué porcentaje de tus ingresos quieres que quede sin gastar cada mes.',
  'objetivos.ayuda.INVESTMENT_RATE':
    'Qué porcentaje de tus ingresos quieres destinar a inversiones.',
  'objetivos.ayuda.EMERGENCY_FUND':
    'Cuántos meses de tus gastos quieres tener cubiertos con dinero líquido.',
  'objetivos.ayuda.DEBT_REDUCTION': 'A cuánto quieres reducir tu deuda total.',

  'dashboard.sinMovimientos': 'Sin movimientos aún',
  'dashboard.sinRegistrar': 'Aún no has registrado movimientos.',
  'dashboard.sinRegistrarPista': 'Escribe o dicta uno arriba y la IA lo registra por ti.',
  'dashboard.comoSacarleJugo': 'Cómo aprovechar AUREM',
  'dashboard.verTodasLasCotizaciones': 'Ver todas las cotizaciones',

  'presupuestos.sinObjetivos':
    'Aún no has definido presupuestos. Registra uno como objetivo y lo verás aquí.',
  'presupuestos.cargar': '+ Agregar objetivo de presupuesto',

  'objetivos.sinIngresos': 'Registra algún ingreso del mes para ver el equivalente en dinero.',
  'objetivos.sinDeuda': 'Hoy no tienes deuda registrada.',
  'objetivos.equivaleDeuda': 'Equivale a reducir la deuda a {monto}.',
  'objetivos.gastoPromedio':
    'Tu gasto promedio mensual es {monto}. Este monto cubre {meses} meses de costo de vida.',
  'objetivos.sinGasto': 'Aún no hay gastos del mes para estimar cuántos meses cubre.',
  'objetivos.elegiUna': 'Elige una…',
  'objetivos.cumplisteUno': '¡Cumpliste un objetivo!',
  'objetivos.cumplisteVarios': '¡Cumpliste {cantidad} objetivos!',
  'objetivos.xpQueda':
    'Sumas {xp} XP. Una vez reclamado, el logro permanece: no se pierde aunque el mes siguiente no lo repitas.',

  'comun.guardando': 'Guardando…',

  'mov.sinEsteMes': 'Aún no has registrado movimientos en {moneda} este mes.',
  'mov.sinFuturas': 'No tienes cuotas pendientes para los meses que vienen.',
  'mov.sinAnteriores': 'No hay movimientos en {moneda} de meses anteriores.',
  'mov.categorias': 'Categorías',

  'cuentas.sinCuentas': 'Aún no tienes cuentas en {moneda}.',
  'deudas.debo': 'Debo',

  'tier.comoFunciona':
    'Cada objetivo que cumples por primera vez suma XP, y el XP nunca baja. Un mes flojo no te quita un logro que ya conseguiste.',
}

const EN: Parcial = {
  'nav.inicio': 'Home',
  'nav.cuentas': 'Accounts',
  'nav.movimientos': 'Transactions',
  'nav.inversiones': 'Investments',
  'nav.mas': 'More',
  'nav.masSecciones': 'More sections',
  'nav.fire': 'FIRE calculator',
  'nav.fireDetalle': 'How far you are from living off your investments',
  'nav.calendario': 'Calendar',
  'nav.calendarioDetalle': 'Statement closings and due dates',
  'nav.deudas': 'Debts and loans',
  'nav.deudasDetalle': 'What you owe and what you are owed',
  'nav.gastoInteligente': 'Smart spending',
  'nav.gastoInteligenteDetalle': 'Cash discount or instalments',
  'nav.consolidado': 'Consolidated view',
  'nav.consolidadoDetalle': 'All your currencies in a single total',
  'nav.guia': 'User guide',
  'nav.guiaDetalle': 'How to get the most out of AUREM',
  'nav.ajustes': 'Settings and profile',
  'nav.ajustesDetalle': 'Currencies, region, budgets and account',
  'nav.objetivos': 'Goals and AUREM Tier',
  'nav.objetivosDetalle': 'Your targets and the badges you unlock',

  'ajustes.idioma': 'Interface language',
  'ajustes.idiomaAyuda':
    'Changes the app text. The region, which sets number and date formats, is chosen separately.',
  'ajustes.region': 'Region and format',
  'ajustes.guardando': 'Saving…',
  'ajustes.guardado': 'Saved',

  'localizacion.titulo': 'Confirm localisation change?',
  'localizacion.cuerpo': 'The interface, formats and user guides will switch to {destino}.',
  'localizacion.confirmar': 'Confirm',
  'localizacion.cancelar': 'Cancel',

  'objetivos.titulo': 'Goals',
  'objetivos.bajada':
    'Targets with a number. Each one you hit earns XP and raises your Tier: nothing here penalises spending, it recognises achievement.',
  'objetivos.nuevo': 'New goal',
  'objetivos.sinObjetivos': "You haven't set any targets yet.",
  'objetivos.logrado': 'Achieved',
  'objetivos.enProgreso': 'In progress',
  'objetivos.meta': 'Target',
  'objetivos.actual': 'Current',
  'objetivos.guardar': 'Save goal',
  'objetivos.borrar': 'Delete',
  'objetivos.tipo.SAVINGS_RATE': 'Monthly savings rate',
  'objetivos.tipo.INVESTMENT_RATE': 'Investment share of income',
  'objetivos.tipo.EMERGENCY_FUND': 'Emergency fund',
  'objetivos.tipo.CATEGORY_BUDGET': 'Category budget',
  'objetivos.tipo.DEBT_REDUCTION': 'Debt reduction',
  'objetivos.ayuda.SAVINGS_RATE': 'What share of your income you want left unspent each month.',
  'objetivos.ayuda.INVESTMENT_RATE': 'What share of your income you want to put into investments.',
  'objetivos.ayuda.EMERGENCY_FUND':
    'How many months of expenses you want covered by liquid money.',
  'objetivos.ayuda.CATEGORY_BUDGET': 'Monthly spending ceiling for a category.',
  'objetivos.ayuda.DEBT_REDUCTION': 'The level you want to bring your total debt down to.',
  'objetivos.unidad.porcentaje': '% of income',
  'objetivos.unidad.meses': 'months of expenses',
  'objetivos.unidad.monto': 'amount',

  'tier.titulo': 'AUREM Tier',
  'tier.xp': 'XP',
  'tier.siguiente': '{xp} XP to {tier}',
  'tier.maximo': "You've reached the highest tier.",
  'dashboard.balance': 'Total balance',
  'dashboard.sinMovimientos': 'No transactions yet',
  'dashboard.ingresos': 'Income',
  'dashboard.gastos': 'Expenses',
  'dashboard.esteMes': 'This month',
  'dashboard.recientes': 'Recent transactions',
  'dashboard.verTodos': 'See all',
  'dashboard.sinRegistrar': 'You have not recorded any transactions yet.',
  'dashboard.sinRegistrarPista': 'Type or dictate one above and the AI will record it for you.',
  'dashboard.comoSacarleJugo': 'Getting the most out of it',
  'dashboard.verGuia': 'Read the full guide',
  'dashboard.cotizaciones': 'Market rates',
  'dashboard.verTodasLasCotizaciones': 'See all rates',
  'dashboard.actualizado': 'Updated {fecha}',
  'dashboard.sinCotizaciones': 'Rates could not be fetched. It will retry on the next refresh.',
  'dashboard.errorCarga': 'There was a problem loading your data: {error}',

  'presupuestos.titulo': 'Category budgets',
  'presupuestos.sinObjetivos':
    'You have not set any budgets yet. Add one as a goal and it will show up here.',
  'presupuestos.cargar': '+ Add a budget goal',
  'presupuestos.deLimite': 'of',
  'presupuestos.excedido': 'Over by {monto}',
  'presupuestos.quedan': '{monto} left',

  'objetivos.porMonto': 'Amount',
  'objetivos.porPorcentaje': 'Percentage',
  'objetivos.equivale': 'Equals {monto} per month',
  'objetivos.equivalePorcentaje': 'Equals {porcentaje}% of your income',
  'objetivos.sinIngresos': 'Record some income this month to see the money equivalent.',
  'objetivos.deudaActual': 'Your total debt today is {monto}.',
  'objetivos.sinDeuda': 'You have no debt recorded today.',
  'objetivos.equivaleDeuda': 'Equals bringing debt down to {monto}.',
  'objetivos.gastoPromedio':
    'Your average monthly spending is {monto}. This amount covers {meses} months of living costs.',
  'objetivos.sinGasto': 'No expenses recorded this month yet to estimate how many months it covers.',
  'objetivos.cancelar': 'Cancel',
  'objetivos.categoria': 'Category',
  'objetivos.elegiUna': 'Choose one…',
  'objetivos.tipoCampo': 'Type',
  'objetivos.reclamar': 'Claim {xp} XP',
  'objetivos.cumplisteUno': 'You hit a goal!',
  'objetivos.cumplisteVarios': 'You hit {cantidad} goals!',
  'objetivos.xpQueda':
    'You earn {xp} XP. Once claimed the achievement stays: you keep it even if next month you do not repeat it.',

  'comun.guardar': 'Save',
  'comun.cancelar': 'Cancel',
  'comun.cerrar': 'Close',
  'comun.borrar': 'Delete',
  'comun.editar': 'Edit',
  'comun.confirmar': 'Confirm',
  'comun.guardando': 'Saving…',
  'comun.moneda': 'Currency',
  'comun.fecha': 'Date',
  'comun.importe': 'Amount',
  'comun.cuenta': 'Account',
  'comun.cuotas': 'Instalments',
  'comun.descripcion': 'Description',
  'comun.enMoneda': 'in {moneda}',

  'nav.compartidos': 'Shared expenses',
  'nav.compartidosDetalle': 'Groups, splits and who owes whom',
  'modulos.titulo': 'App modules',
  'modulos.fijo': 'Core module, always on',
  'modulos.ayuda':
    'Turning a module off removes it from navigation and from home. It deletes nothing: the data stays and comes back if you turn it on again.',
  'modulos.faltaMigracion':
    'Run migrations/011_shared_expenses_and_modules.sql in the Supabase SQL Editor.',
  'modulos.cuentasDetalle': 'Banks, wallets, cash and cards',
  'modulos.movimientosDetalle': 'Income, expenses and transfers',
  'modulos.inversionesDetalle': 'Portfolio, returns and liquidity',
  'modulos.cuotas': 'Committed balance',
  'modulos.cuotasDetalle': 'Instalment plans and the 12-month curve',

  'compartidos.titulo': 'Shared expenses',
  'compartidos.bajada':
    'Groups where several people chip in. Each expense has one payer and a split: the app works out who owes whom.',
  'compartidos.nuevoGrupo': 'Create a group',
  'compartidos.escanear': 'Scan an invite QR',
  'compartidos.sinGrupos': 'No groups yet. Create one or join with a QR.',
  'compartidos.miembros': '{cantidad} members',
  'compartidos.mostrarQr': 'Show invite QR',
  'compartidos.qrAyuda': 'Have them scan it with their phone camera. Sharing the link also works.',
  'compartidos.copiarEnlace': 'Copy link',
  'compartidos.copiado': 'Link copied',
  'compartidos.unirse': 'Join the group',
  'compartidos.yaSosMiembro': 'You are already in this group.',
  'compartidos.nuevoGasto': 'Add an expense',
  'compartidos.pagadoPor': 'Paid by',
  'compartidos.reparto': 'Split',
  'compartidos.partesIguales': 'Equal shares',
  'compartidos.sinGastos': 'No expenses in this group yet.',
  'compartidos.saldar': 'Settle up',
  'compartidos.balanceCero': 'All square: nobody owes anybody.',
  'compartidos.leDebe': '{deudor} owes {monto} to {acreedor}',
  'compartidos.tuBalance': 'Your balance',
  'compartidos.teDeben': 'You are owed',
  'compartidos.debes': 'You owe',
  'compartidos.totalGrupo': 'Group total',
  'compartidos.sumaCien': 'The split must add up to 100%. It currently adds up to {suma}%.',

  'calculadora.titulo': 'Night-out calculator',
  'calculadora.bajada': 'Split the bill and, if you want, record the expense properly.',
  'calculadora.total': 'Bill total',
  'calculadora.personas': 'Number of people',
  'calculadora.propina': 'Tip and extras',
  'calculadora.porPersona': 'Per person',
  'calculadora.conPropina': 'Total with tip',
  'calculadora.comoRegistrar': 'How should we record it?',
  'calculadora.opcionA': 'I paid the whole bill',
  'calculadora.opcionADetalle':
    'Records the full amount leaving your account, books your share as an expense and leaves the rest as money owed to you. When they pay you back, you clear that debt without inflating your income.',
  'calculadora.opcionB': 'Only my share',
  'calculadora.opcionBDetalle':
    'Records just your share. It assumes everyone else paid their part on the spot.',
  'calculadora.registrar': 'Record',
  'calculadora.registrado': 'Done, it has been recorded.',
  'calculadora.descripcion': 'Description',

  'mov.titulo': 'Transactions',
  'mov.mesActual': 'This month',
  'mov.cuotasFuturas': 'Upcoming instalments',
  'mov.anteriores': 'Earlier',
  'mov.periodo': 'History period',
  'mov.sinEsteMes': 'No transactions in {moneda} this month yet.',
  'mov.sinFuturas': 'No instalments pending for the months ahead.',
  'mov.sinAnteriores': 'No transactions in {moneda} from earlier months.',
  'mov.categorias': 'Categories',
  'mov.editar': 'Edit transaction',
  'mov.dejarComoEsta': 'Leave as is',
  'mov.guardarCambios': 'Save changes',
  'mov.borrarMovimiento': 'Delete transaction',
  'mov.confirmarBorrado': 'Confirm deletion',
  'mov.editarNombre': 'Edit {nombre}',

  'cuentas.titulo': 'Accounts and cards',
  'cuentas.liquido': 'Liquid',
  'cuentas.deudaTarjetas': 'Card debt',
  'cuentas.patrimonioNeto': 'Net worth',
  'cuentas.formula': 'Liquid + investments + receivables − cards − debts',
  'cuentas.carteraYRendimiento': 'Portfolio and returns',
  'cuentas.importarResumen': 'Import statement',
  'cuentas.sinCuentas': 'You have no accounts in {moneda} yet.',
  'cuentas.enMoneda': 'Accounts in {moneda}',

  'deudas.titulo': 'Debts and loans',
  'deudas.meDeben': 'Owed to me',
  'deudas.debo': 'I owe',

  'cuotas.sinPendientes': 'No pending instalments',
  'cuotas.porMesConVencimientos': 'Per month with due dates',
  'cuotas.primerMesLibre': 'First month with nothing due',

  'consolidado.cuentasYBilleteras': 'Accounts and wallets',
  'consolidado.inversiones': 'Investments',
  'consolidado.meDeben': 'Owed to me',
  'consolidado.deudaTarjetas': 'Card debt',
  'consolidado.deudasPersonales': 'Personal debts',
  'consolidado.neto': 'Net',
  'consolidado.liquidezTotal': 'Total liquidity',
  'consolidado.pasivosTotales': 'Total liabilities',

  'fire.gastoDelMes': 'Spending this month',
  'fire.promedioMensual': 'Monthly average',
  'fire.capitalObjetivo': 'Target capital · the 4% rule',

  'inv.ponderado': 'Weighted over liquid assets',
  'inv.rescatableHoy': 'Available today (T+0)',
  'inv.asistenteDeGasto': 'Spending assistant',

  'ajustes.titulo': 'Settings',
  'ajustes.cuenta': 'Account',
  'ajustes.categoriasContador': 'Categories',
  'ajustes.periodoActual': 'Current period',
  'ajustes.cotizacion': 'Exchange rate',
  'ajustes.sinCotizacion': 'The exchange rate could not be fetched.',

  'tier.comoFunciona':
    'Every goal you hit for the first time earns XP, and XP never goes down. A weak month cannot take away something you already achieved.',
}

const DICCIONARIOS: Record<Idioma, Parcial> = {
  'es-AR': {},
  es: ES_NEUTRO,
  en: EN,
}

/**
 * Traduce una clave, con interpolación de `{variables}`.
 *
 * Cae a es-AR cuando falta la traducción, y a la clave misma si tampoco está
 * ahí: una cadena sin traducir se ve rara, pero una pantalla en blanco por un
 * `undefined` es un bug.
 */
export function traducir(
  idioma: Idioma,
  clave: Clave,
  variables?: Record<string, string | number>
): string {
  const texto = DICCIONARIOS[idioma]?.[clave] ?? ES_AR[clave] ?? clave

  if (!variables) return texto

  return Object.entries(variables).reduce(
    (acumulado, [nombre, valor]) => acumulado.replaceAll(`{${nombre}}`, String(valor)),
    texto
  )
}

export type Traductor = (clave: Clave, variables?: Record<string, string | number>) => string

/** El traductor atado a un idioma, para no pasarlo en cada llamada. */
export function crearTraductor(idioma: Idioma): Traductor {
  return (clave, variables) => traducir(idioma, clave, variables)
}
