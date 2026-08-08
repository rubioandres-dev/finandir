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
 * confirmación de localización, la guía de uso completa —esta última con
 * contenido propio por idioma en `lib/guide-content.ts`—, el editor de
 * movimientos y los formularios de carga: Smart Input, escáner de
 * comprobantes, importador de resúmenes, inversiones, alta de cuentas y
 * tarjetas, y deudas y préstamos.
 *
 * NO cubierto todavía: las vistas de solo lectura que muestran etiquetas de
 * enums desde `ETIQUETA_*` de `lib/types.ts` (`transaction-row`,
 * `account-row`, `investment-distribution`,
 * `investment-strategy-breakdown`), el onboarding y los mensajes de error que
 * devuelven las server actions. `t()` devuelve la clave si falta una
 * traducción, así que lo que falte se ve pero no rompe.
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
  'presupuestos.administrar': 'Administrar',
  'presupuestos.sinObjetivos':
    'Todavía no definiste presupuestos. Cargá un techo por categoría en Ajustes y lo vas a ver acá.',
  'presupuestos.cargar': '+ Cargar un presupuesto',
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
  'calculadora.descripcionPorDefecto': 'Salida compartida',
  'calculadora.propinaOpcional': 'Propina / Adicional % (opcional)',
  'calculadora.agregarNombres': '+ Agregar nombres de participantes (opcional)',
  'calculadora.participantes': 'Participantes',
  'calculadora.quitarNombres': 'Quitar los nombres',
  'calculadora.nombresAyuda':
    'Cargá los {cantidad} nombres de los demás; tu parte no va acá. Sale una cuenta por cobrar por persona.',
  'calculadora.nombrePlaceholder': 'Persona {numero}',
  'calculadora.categoria': 'Categoría del gasto',
  'calculadora.pagadoCon': 'Pagado con',
  'calculadora.faltaCategoria': 'Elegí la categoría a la que se imputa tu parte.',
  'calculadora.faltanNombres':
    'Completá todos los nombres, o cerrá la lista para generar un único monto a cobrar.',
  'calculadora.salidaBancaria': 'Salida bancaria',
  'calculadora.gastoImputado': 'Gasto imputado',
  'calculadora.montoACobrar': 'Monto a cobrar',
  'calculadora.enRegistros': '{cantidad} registros individuales',
  'calculadora.registroUnico': 'un registro acumulado',

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
  /**
   * Sólo para el caso raro: el movimiento apunta a una cuenta que no está en la
   * lista de elegibles, porque es de otra moneda. Sólo puede pasar con filas
   * anteriores al trigger de migrations/002, que hoy impide esa combinación.
   */
  'mov.cuentaActual': 'La cuenta con la que se cargó',
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

  // ===========================================================================
  // Microcopy de los formularios de carga
  // ===========================================================================
  // Smart Input, escáner de comprobantes, importador de resúmenes, inversiones,
  // alta de cuentas y deudas. Es el bloque más voluminoso de la app: son las
  // pantallas donde se ESCRIBE el dato, y ahí una etiqueta ambigua no molesta,
  // cuesta un movimiento mal cargado.
  //
  // LOS EJEMPLOS Y LOS PLACEHOLDERS NO SE TRADUCEN LITERAL
  //
  // "Cargué 25 lucas de nafta" enseña a usar el campo sólo si se entiende:
  // fuera de Argentina no significa nada. Cada idioma tiene su propio ejemplo,
  // equivalente en intención y no en palabras. Lo mismo con "Visa Galicia" o
  // "FCI Galileo T+0", que son nombres de productos locales.
  //
  // NO SE INVENTAN CLAVES NUEVAS PARA CADENAS QUE YA EXISTEN
  //
  // Los formularios reusan `comun.*`, `mov.guardarCambios`, `mov.editarNombre`,
  // `objetivos.categoria` y `objetivos.tipoCampo` cuando el texto es idéntico.
  // Una segunda clave con el mismo valor es una traducción más para mantener y
  // una oportunidad más de que las dos se desincronicen.

  // --- Etiquetas de los enums -----------------------------------------------
  // Duplican los `ETIQUETA_*` de `lib/types.ts`. Esas constantes siguen ahí
  // porque las usan las vistas de solo lectura que todavía no están traducidas
  // (`transaction-row`, `account-row`, `investment-distribution`); los
  // formularios de este bloque leen de acá.
  'tipoMov.INCOME': 'Ingreso',
  'tipoMov.EXPENSE': 'Gasto',
  'tipoMov.TRANSFER': 'Transferencia',

  'tipoCuenta.BANK': 'Banco',
  'tipoCuenta.WALLET': 'Billetera',
  'tipoCuenta.CASH': 'Efectivo',
  'tipoCuenta.INVESTMENT': 'Inversión',
  'tipoCuenta.CREDIT_CARD': 'Tarjeta de crédito',

  'tipoActivo.MONEY_MARKET': 'Money market',
  'tipoActivo.FIXED_INCOME': 'Renta fija',
  'tipoActivo.STOCKS_CEDEARS': 'Acciones y CEDEARs',
  'tipoActivo.CRYPTO': 'Cripto',
  'tipoActivo.TIME_DEPOSIT': 'Plazo fijo',
  'tipoActivo.REAL_ESTATE': 'Inmuebles',

  'liquidez.T0': 'Inmediata (T+0)',
  'liquidez.T1': '24 h (T+1)',
  'liquidez.T2': '48 h (T+2)',
  'liquidez.LOCKED': 'Inmovilizada',

  // --- Comunes de los formularios -------------------------------------------
  'comun.nombre': 'Nombre',
  'comun.monto': 'Monto',
  'comun.cuentaPorDefecto': 'Cuenta por defecto',
  'comun.borrarNombre': 'Borrar {nombre}',
  'comun.errorEstado': 'Error {status}',

  // --- Smart Input ----------------------------------------------------------
  'smart.placeholder': 'Gasté $1500 en la carnicería hoy',
  'smart.escuchando': 'Te escucho…',
  'smart.ariaCampo': 'Describí el movimiento en lenguaje natural',
  'smart.ejemplo1': 'Gasté 1500 en la carnicería hoy',
  'smart.ejemplo2': 'Cargué 25 lucas de nafta',
  'smart.ejemplo3': 'Cobré el sueldo',
  'smart.detenerDictado': 'Detener dictado sin analizar',
  'smart.dictar': 'Dictar por voz: al hacer una pausa se analiza solo',
  'smart.detenerCorto': 'Detener sin analizar',
  'smart.dictarCorto': 'Dictar por voz — al pausar se analiza automáticamente',
  'smart.analizar': 'Analizar con IA',
  'smart.interpretando': 'Interpretando…',
  'smart.comoPagar': '¿Cómo conviene pagar?',
  'smart.interpretandoVoz': 'Terminaste de hablar: interpretando lo que dictaste…',
  'smart.interpretandoTexto': 'La IA está interpretando tu movimiento…',
  'smart.sinConexion': 'No se pudo conectar con el servidor.',
  'smart.guardado': 'Movimiento guardado.',
  'smart.revisa': 'Revisá antes de guardar',
  'smart.monedaDelMovimiento': 'Moneda del movimiento',
  'smart.sinCategoria': 'Sin categoría',
  'smart.pagadoCon': 'Pagado con',
  'smart.unPago': 'Un pago',
  'smart.cuotasN': '{cantidad} cuotas',
  'smart.tieneInteres': '¿Tiene interés?',
  'smart.comoInformas': 'Cómo informás el financiamiento',
  'smart.financiadoTotal': 'Monto financiado total',
  'smart.valorCuota': 'Valor de cada cuota',
  'smart.totalConRecargo': 'Total a pagar con recargo',
  'smart.precioContado': 'Precio contado',
  'smart.tituloFinanciado': 'Financiado total',
  // El importe va en <strong> en el medio de la frase, así que la oración se
  // parte en dos claves. Cada mitad se traduce entera: no se arma la frase
  // concatenando palabras sueltas, que es lo que rompe el orden en inglés.
  'smart.recargo': 'Recargo:',
  'smart.sobreElContado': 'sobre el contado',
  'smart.cuotasDe': '{cuotas} cuotas de',
  'smart.porMesTotal': '/mes (Total financiado: {total})',
  'smart.confirmar': 'Confirmar y guardar',
  'smart.descartar': 'Descartar',

  // --- Escáner de comprobantes ----------------------------------------------
  'escaner.titulo': 'Comprobante',
  'escaner.altPrevia': 'Comprobante a analizar',
  'escaner.leyendo': 'Leyendo el comprobante…',
  'escaner.demora': 'Suele tardar unos segundos.',
  'escaner.errorLectura': 'No se pudo leer el comprobante.',
  'escaner.errorConexion': 'No se pudo contactar al servidor. Revisá tu conexión.',
  'escaner.errorImporte': 'El importe tiene que ser un número mayor a cero.',
  'escaner.comercio': 'Comercio',
  'escaner.importeTotal': 'Importe total',
  'escaner.monedaDelComprobante': 'Moneda del comprobante',
  'escaner.sinCuentas': 'Sin cuentas en {moneda}',
  'escaner.esTarjeta': '(tarjeta)',
  'escaner.avisoCuotas':
    'Se van a crear {cuotas} cuotas de {monto}, una por mes. El importe de arriba es el total de la operación.',
  'escaner.avisoMoneda':
    'Este movimiento va al libro de {moneda} y estás mirando el de {actual}: no lo vas a ver en la lista hasta que cambies de moneda en el header.',
  'escaner.guardar': 'Guardar movimiento',

  // --- Importador de resúmenes ----------------------------------------------
  'importador.nuevos': 'Nuevos',
  'importador.registrados': 'Registrados',
  'importador.diferencias': 'Ajustes / Diferencias',
  'importador.leyendoArchivo': 'Leyendo {archivo}…',
  'importador.extrayendo': 'La IA está extrayendo los consumos. Puede tardar hasta un minuto.',
  'importador.arrastra': 'Arrastrá el resumen de tu tarjeta',
  'importador.formatos': 'PDF o foto, hasta 8 MB',
  'importador.elegirArchivo': 'Elegir archivo',
  'importador.sinConsumos': 'No se detectó ningún consumo en el archivo.',
  'importador.errorArchivo': 'No se pudo procesar el archivo. Probá de nuevo.',
  'importador.importados': 'Se importaron {cantidad} movimientos.',
  'importador.detectados': '{cantidad} consumos detectados',
  'importador.cambiar': 'Cambiar',
  'importador.resultado': 'Resultado de la conciliación',
  'importador.sinEnPestana': 'No hay consumos en esta categoría.',
  'importador.importarFila': 'Importar {descripcion}',
  'importador.cuotaDe': 'cuota {actual}/{total}',
  // El motivo lo arma `reconciliation-service` en castellano para el log; en
  // pantalla se rearma acá, que es donde se sabe el idioma del usuario.
  'importador.yaRegistrado': 'ya registrado el {fecha}',
  'importador.otroImporte': 'coincide con un movimiento del {fecha} por otro importe',
  'importador.tarjetaDelResumen': 'Tarjeta del resumen',
  'importador.sinTarjetas': 'No tenés tarjetas cargadas',
  'importador.confirmarUna': 'Confirmar e importar 1 transacción',
  'importador.confirmarVarias': 'Confirmar e importar {cantidad} transacciones',

  // --- Inversiones ----------------------------------------------------------
  'inv.nueva': 'Nueva inversión',
  'inv.editarTitulo': 'Editar inversión',
  'inv.placeholderNombre': 'FCI Galileo T+0',
  'inv.tipoDeActivo': 'Tipo de activo',
  'inv.montoInvertido': 'Monto invertido',
  'inv.valorActual': 'Valor actual',
  'inv.igualAlInvertido': 'Igual al invertido',
  'inv.tna': 'TNA estimada (%)',
  'inv.tnaSufijo': '{tna}% TNA',
  'inv.liquidez': 'Liquidez',
  'inv.ayudaLiquidez':
    'Solo T+0 y T+1 cuentan para la tasa que usa el asistente de gasto: es la plata que podés rescatar a tiempo para cubrir una compra.',
  'inv.errorInvertido': 'Poné cuánto invertiste.',
  'inv.errorTna': 'La TNA no puede ser negativa.',
  'inv.registrar': 'Registrar inversión',
  'inv.activosEn': 'Activos en {moneda}',
  'inv.sinActivos': 'Todavía no cargaste inversiones.',
  'inv.sinActivosPista':
    'Cargalas y el asistente de gasto usa tu tasa real en vez de una estimada.',

  // --- Alta de cuentas y tarjetas -------------------------------------------
  'cuentas.agregar': 'Agregar cuenta o tarjeta',
  'cuentas.nueva': 'Nueva cuenta',
  'cuentas.editar': 'Editar cuenta',
  'cuentas.placeholderTarjeta': 'Visa Galicia',
  'cuentas.placeholderCuenta': 'Cuenta sueldo',
  'cuentas.deudaActual': 'Deuda actual',
  'cuentas.saldoActual': 'Saldo actual',
  'cuentas.saldoInicial': 'Saldo inicial (opcional)',
  'cuentas.ayudaDeuda': 'En positivo: lo que debés hoy en esta tarjeta.',
  'cuentas.ayudaSaldo':
    'Después lo mantienen los movimientos; editalo solo para corregirlo.',
  'cuentas.diaCierre': 'Día de cierre',
  'cuentas.diaVencimiento': 'Día de vencimiento',
  'cuentas.limite': 'Límite (opcional)',
  'cuentas.sinLimite': 'Sin límite',
  'cuentas.ultimosDigitos': 'Últimos 4 dígitos',
  'cuentas.banco': 'Banco (opcional)',
  'cuentas.placeholderBanco': 'Galicia',
  'cuentas.errorSaldo': 'El saldo tiene que ser un número.',

  // --- Deudas y préstamos ---------------------------------------------------
  'deudas.nueva': 'Nueva deuda',
  'deudas.registrar': 'Registrar deuda o préstamo',
  'deudas.tipoDeDeuda': 'Tipo de deuda',
  'deudas.quienTeDebe': '¿Quién te debe?',
  'deudas.aQuienLeDebes': '¿A quién le debés?',
  'deudas.placeholderNombre': 'Nombre',
  'deudas.vence': 'Vence (opcional)',
  'deudas.nota': 'Nota (opcional)',
  'deudas.placeholderNota': 'Cena, préstamo…',
  'deudas.errorMonto': 'Ingresá un monto válido.',
  'deudas.meDebe': 'Me debe',
  'deudas.leDebo': 'Le debo',
  'deudas.venceEl': 'vence {fecha}',
  'deudas.deTotal': 'de {monto}',
  'deudas.saldadoPorcentaje': '{porcentaje}% saldado',
  'deudas.progresoDe': 'Saldado de {nombre}',
  'deudas.registrarPago': 'Registrar pago',
  'deudas.saldada': 'Saldada',
  'deudas.contadorSaldada': '{cantidad} saldada',
  'deudas.contadorSaldadas': '{cantidad} saldadas',
  'deudas.sinDeudas': 'No tenés deudas ni préstamos registrados.',
  'deudas.borrar': 'Borrar deuda',

  // --- Barra de confirmación diferida en Ajustes ----------------------------
  'ajustes.sinGuardar': 'Tenés cambios sin guardar',
  'ajustes.descartar': 'Descartar',
  'ajustes.barraAria': 'Cambios pendientes de guardar',
  'ajustes.guardadoOk': 'Ajustes guardados',
  'ajustes.cambioModulos': 'Módulos',
  'ajustes.cambioRegion': 'Región',
  'ajustes.cambioIdioma': 'Idioma',
  'ajustes.avisoDiferido':
    'Los cambios de esta sección se aplican cuando confirmás abajo.',

  // --- Card de balance del dashboard ----------------------------------------
  // Textos CORTOS a propósito: la card es una sola superficie y cada renglón de
  // prosa que se agrega la empuja hacia abajo. Lo que explica el modelo vive en
  // los comentarios del componente y en la guía de uso, no en pantalla.
  'balance.patrimonioTotal': 'Patrimonio neto total',
  'balance.liquidezHoy': 'Liquidez hoy',
  'balance.tarjetas': 'Tarjetas · comprometido',
  'balance.inversiones': 'Inversiones y activos',
  'balance.venceEsteMes': 'Vence este mes:',
  'balance.alertaCorta': 'No lo cubre tu liquidez',
  'balance.sinCotizacion': 'Sin cotización',
  'balance.sinCotizacionCorto': 'No se pudo cotizar {monedas}: los libros no se unifican.',

  // --- Evolutivo mensual y accesos rápidos ----------------------------------
  'evolutivo.titulo': 'Ingresos vs. gastos · 12 meses',
  'evolutivo.sinDatos': 'Todavía no hay movimientos en {moneda} para dibujar la serie.',
  'accesos.titulo': 'Accesos rápidos',

  // --- Recorrido guiado -----------------------------------------------------
  'tour.titulo': 'Recorrido guiado',
  'tour.abrir': 'Ver recorrido guiado',
  'tour.ayuda': 'Ayuda y recorrido guiado',
  'tour.anterior': 'Atrás',
  'tour.siguiente': 'Siguiente',
  'tour.terminar': 'Listo',
  'tour.saltar': 'Saltar el recorrido',
  'tour.contador': 'Paso {actual} de {total}',
  'tour.balanceTitulo': 'Tu patrimonio, en una sola lectura',
  'tour.balanceCuerpo':
    'Arriba, cuánto tenés en total. Abajo, las tres capas que lo componen: lo que podés gastar hoy, lo que ya está comprometido en tarjetas y lo que está invertido. Las tarjetas NO se descuentan de la liquidez: ese consumo no sale de tu caja hasta el vencimiento.',
  'tour.entradaTitulo': 'Cargá un gasto hablando',
  'tour.entradaCuerpo':
    'Escribí o dictá "gasté 15 lucas en el súper" y la IA arma el movimiento: importe, categoría, fecha y cuenta. Nada se guarda solo — siempre revisás antes de confirmar.',
  'tour.gastoTitulo': 'Con qué tarjeta conviene pagar',
  'tour.gastoCuerpo':
    'AUREM mira los días de cierre de cada tarjeta y te dice cuál te da más plazo. Y en el asistente de gasto podés comparar contado con descuento contra cuotas, usando la tasa real de tus inversiones.',
  'tour.inversionesTitulo': 'Tu tasa real, no una estimada',
  'tour.inversionesCuerpo':
    'Cargá tus inversiones con su TNA y su plazo de rescate. Lo que se rescata el mismo día cuenta como liquidez; el resto es patrimonio que no está disponible hoy. Esa distinción es la que hace útil al asistente de gasto.',

  // --- Exportación a Excel --------------------------------------------------
  'excel.descargar': 'Descargar Excel',
  'excel.generando': 'Armando el archivo…',
  'excel.error': 'No se pudo generar. Reintentá',

  // --- Gastos compartidos: invitados, pagos y objetivos del grupo -----------
  'compartidos.agregarInvitado': 'Agregar invitado',
  'compartidos.invitado': '(invitado)',
  'compartidos.invitadoAyuda':
    'Para repartir con alguien que no usa AUREM. Participa de los gastos y de los saldos, pero no ve el grupo.',
  'compartidos.nombreInvitadoVacio': 'Poné un nombre.',
  'compartidos.registrarPago': 'Registrar un pago',
  'compartidos.paga': 'Paga',
  'compartidos.cobra': 'Cobra',
  'compartidos.pagoMismaPersona': 'El que paga y el que cobra tienen que ser distintos.',
  'compartidos.pagosRegistrados': 'Pagos registrados',

  'grupoObjetivos.titulo': 'Objetivos del grupo',
  'grupoObjetivos.nuevo': 'Nuevo objetivo',
  'grupoObjetivos.sinObjetivos': 'Todavía no hay objetivos en este grupo.',
  'grupoObjetivos.sinTitulo': 'Poné un título.',
  'grupoObjetivos.placeholderTitulo': 'Alquiler de la casa de verano',
  'grupoObjetivos.tipoAhorro': 'Ahorro conjunto',
  'grupoObjetivos.tipoPresupuesto': 'Presupuesto por categoría',
  'grupoObjetivos.aporteMensual': 'Aporte mensual',
  'grupoObjetivos.presupuestoNoDisponible':
    'El presupuesto por categoría todavía no se puede cargar desde acá: falta el selector de categoría.',

  // --- Inversiones: KPI, formulario y recorrido -----------------------------
  'inv.totalInvertido': 'Total invertido',
  'inv.sobreLoInvertido': 'sobre lo invertido',
  'inv.tnaPonderada': 'TNA promedio líquida',
  'inv.tnaAlimenta':
    'Esta tasa alimenta el comparador de Gasto Inteligente para evaluar compras en cuotas.',
  'inv.gananciaPasiva': 'Ganancia mensual estimada',
  'inv.gananciaPasivaDetalle': 'Lo que rinde tu cartera por mes a la tasa que cargaste.',
  'inv.distribucion': 'Distribución por tipo',
  'inv.entidad': 'Dónde está',
  'inv.placeholderEntidad': 'Mercado Pago, Balanz, Binance…',
  'inv.rendimientoProyectado': 'Retorno mensual estimado',
  'inv.rendimientoFormula': 'Monto × TNA ÷ 12 (base 30/365)',
  'inv.elegiTipo': 'Qué tipo de activo es',
  'inv.plazoSugerido': 'Se preseleccionó el plazo habitual. Podés cambiarlo.',

  'inv.badge.MONEY_MARKET': 'Money market',
  'inv.badgeDetalle.MONEY_MARKET':
    'Rescate inmediato, 24/7. Suma directo a tu Liquidez Hoy en el inicio.',
  'inv.badge.FIXED_INCOME': 'Renta fija y cauciones',
  'inv.badgeDetalle.FIXED_INCOME':
    'Liquida en 24 o 48 h: bonos, Lecaps, cauciones. Cuenta como inversión, no como liquidez.',
  'inv.badge.TIME_DEPOSIT': 'Plazo fijo',
  'inv.badgeDetalle.TIME_DEPOSIT': 'Capital bloqueado hasta el vencimiento.',
  'inv.badge.STOCKS_CEDEARS': 'Acciones y CEDEARs',
  'inv.badgeDetalle.STOCKS_CEDEARS': 'Renta variable en bolsa.',
  'inv.badge.CRYPTO': 'Cripto y stablecoins',
  'inv.badgeDetalle.CRYPTO': 'USDT, USDC, BTC, ETH.',
  'inv.badge.REAL_ESTATE': 'Inmuebles',
  'inv.badgeDetalle.REAL_ESTATE': 'Ladrillos: no se rescatan para cubrir una compra.',

  'tour.invTitulo': 'Cómo leer tus inversiones',
  'tour.invLiquidezTitulo': 'T+0 no es lo mismo que T+1',
  'tour.invLiquidezCuerpo':
    'Lo que se rescata el mismo día (money market) suma a tu Liquidez Hoy en el inicio: es plata que podés gastar. Lo que liquida en 24 o 48 h queda en Inversiones. La diferencia no es contable, es práctica: una define qué podés pagar hoy.',
  'tour.invTnaTitulo': 'Para qué sirve la TNA ponderada',
  'tour.invTnaCuerpo':
    'AUREM promedia la tasa de tus activos líquidos pesándolos por monto. Si tenés $800.000 al 70% y $200.000 al 30%, tu tasa real es 62%: ese es el número contra el que el asistente compara el costo de pagar en cuotas. Si las cuotas salen más que eso, conviene pagar de contado.',
  'tour.invPasivaTitulo': 'Tu sueldo pasivo',
  'tour.invPasivaCuerpo':
    'La ganancia mensual estimada es lo que genera tu cartera sin que hagas nada. Es una proyección a la tasa que vos cargaste, no un rendimiento medido: si la TNA quedó vieja, este número también.',

  // --- Barra lateral --------------------------------------------------------
  'sidebar.plegar': 'Plegar el menú',
  'sidebar.desplegar': 'Desplegar el menú',
  'presupuestos.detalle': 'Techos de gasto por categoría',
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
    'Aún no has definido presupuestos. Registra un techo por categoría en Ajustes y lo verás aquí.',
  'presupuestos.cargar': '+ Agregar un presupuesto',

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

  // --- Formularios de carga -------------------------------------------------
  // Sin voseo y sin instrumentos argentinos: un CEDEAR no existe fuera del
  // país, y un ejemplo con "lucas" o "nafta" no le enseña nada a nadie.
  'tipoActivo.STOCKS_CEDEARS': 'Acciones y ETFs',

  'smart.placeholder': 'Gasté $1500 en el supermercado hoy',
  'smart.ariaCampo': 'Describe el movimiento en lenguaje natural',
  'smart.ejemplo1': 'Gasté 1500 en el supermercado hoy',
  'smart.ejemplo2': 'Cargué 2000 de combustible',
  'smart.comoInformas': 'Cómo informas el financiamiento',
  'smart.revisa': 'Revisa antes de guardar',

  'escaner.errorConexion': 'No se pudo contactar al servidor. Revisa tu conexión.',
  'escaner.avisoCuotas':
    'Se crearán {cuotas} cuotas de {monto}, una por mes. El importe de arriba es el total de la operación.',
  'escaner.avisoMoneda':
    'Este movimiento va al libro de {moneda} y estás viendo el de {actual}: no lo verás en la lista hasta que cambies de moneda en el encabezado.',

  'importador.arrastra': 'Arrastra el resumen de tu tarjeta',
  'importador.errorArchivo': 'No se pudo procesar el archivo. Inténtalo de nuevo.',
  'importador.sinTarjetas': 'No tienes tarjetas registradas',

  'inv.placeholderNombre': 'Fondo money market',
  'inv.ayudaLiquidez':
    'Solo T+0 y T+1 cuentan para la tasa que usa el asistente de gasto: es el dinero que puedes rescatar a tiempo para cubrir una compra.',
  'inv.errorInvertido': 'Indica cuánto invertiste.',
  'inv.sinActivos': 'Aún no has registrado inversiones.',
  'inv.sinActivosPista':
    'Regístralas y el asistente de gasto usa tu tasa real en vez de una estimada.',

  'cuentas.placeholderTarjeta': 'Visa clásica',
  'cuentas.placeholderCuenta': 'Cuenta de nómina',
  'cuentas.placeholderBanco': 'Santander',
  'cuentas.ayudaDeuda': 'En positivo: lo que debes hoy en esta tarjeta.',
  'cuentas.ayudaSaldo':
    'Después lo mantienen los movimientos; edítalo solo para corregirlo.',

  'deudas.aQuienLeDebes': '¿A quién le debes?',
  'deudas.errorMonto': 'Ingresa un monto válido.',
  'deudas.sinDeudas': 'No tienes deudas ni préstamos registrados.',

  'ajustes.sinGuardar': 'Tienes cambios sin guardar',
  'ajustes.avisoDiferido': 'Los cambios de esta sección se aplican cuando confirmas abajo.',

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
  'presupuestos.administrar': 'Manage',
  'presupuestos.sinObjetivos':
    'You have not set any budgets yet. Add a per-category cap in Settings and it will show up here.',
  'presupuestos.cargar': '+ Add a budget',
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
  'calculadora.descripcionPorDefecto': 'Shared outing',
  'calculadora.propinaOpcional': 'Tip / extras % (optional)',
  'calculadora.agregarNombres': '+ Add participant names (optional)',
  'calculadora.participantes': 'Participants',
  'calculadora.quitarNombres': 'Remove the names',
  'calculadora.nombresAyuda':
    'Enter the {cantidad} other names; yours does not go here. You get one receivable per person.',
  'calculadora.nombrePlaceholder': 'Person {numero}',
  'calculadora.categoria': 'Expense category',
  'calculadora.pagadoCon': 'Paid with',
  'calculadora.faltaCategoria': 'Pick the category your share is booked to.',
  'calculadora.faltanNombres':
    'Fill in every name, or close the list to generate a single amount to collect.',
  'calculadora.salidaBancaria': 'Bank outflow',
  'calculadora.gastoImputado': 'Booked expense',
  'calculadora.montoACobrar': 'Amount to collect',
  'calculadora.enRegistros': '{cantidad} individual records',
  'calculadora.registroUnico': 'one pooled record',

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
  'mov.cuentaActual': 'The account it was recorded with',
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

  'tipoMov.INCOME': 'Income',
  'tipoMov.EXPENSE': 'Expense',
  'tipoMov.TRANSFER': 'Transfer',

  'tipoCuenta.BANK': 'Bank',
  'tipoCuenta.WALLET': 'Wallet',
  'tipoCuenta.CASH': 'Cash',
  'tipoCuenta.INVESTMENT': 'Investment',
  'tipoCuenta.CREDIT_CARD': 'Credit card',

  'tipoActivo.MONEY_MARKET': 'Money market',
  'tipoActivo.FIXED_INCOME': 'Fixed income',
  'tipoActivo.STOCKS_CEDEARS': 'Stocks and ETFs',
  'tipoActivo.CRYPTO': 'Crypto',
  'tipoActivo.TIME_DEPOSIT': 'Fixed-term deposit',
  'tipoActivo.REAL_ESTATE': 'Real estate',

  'liquidez.T0': 'Same day (T+0)',
  'liquidez.T1': '24 h (T+1)',
  'liquidez.T2': '48 h (T+2)',
  'liquidez.LOCKED': 'Locked',

  'comun.nombre': 'Name',
  'comun.monto': 'Amount',
  'comun.cuentaPorDefecto': 'Default account',
  'comun.borrarNombre': 'Delete {nombre}',
  'comun.errorEstado': 'Error {status}',

  'smart.placeholder': 'Spent 1500 on groceries today',
  'smart.escuchando': 'Listening…',
  'smart.ariaCampo': 'Describe the transaction in plain language',
  'smart.ejemplo1': 'Spent 1500 on groceries today',
  'smart.ejemplo2': 'Paid 2000 for petrol',
  'smart.ejemplo3': 'Got my salary',
  'smart.detenerDictado': 'Stop dictating without analysing',
  'smart.dictar': 'Dictate: it analyses on its own when you pause',
  'smart.detenerCorto': 'Stop without analysing',
  'smart.dictarCorto': 'Dictate — it analyses automatically when you pause',
  'smart.analizar': 'Analyse with AI',
  'smart.interpretando': 'Reading it…',
  'smart.comoPagar': 'What is the best way to pay?',
  'smart.interpretandoVoz': 'You stopped talking: reading what you dictated…',
  'smart.interpretandoTexto': 'The AI is reading your transaction…',
  'smart.sinConexion': 'Could not reach the server.',
  'smart.guardado': 'Transaction saved.',
  'smart.revisa': 'Check it before saving',
  'smart.monedaDelMovimiento': 'Transaction currency',
  'smart.sinCategoria': 'No category',
  'smart.pagadoCon': 'Paid with',
  'smart.unPago': 'Single payment',
  'smart.cuotasN': '{cantidad} instalments',
  'smart.tieneInteres': 'Does it carry interest?',
  'smart.comoInformas': 'How you are entering the financing',
  'smart.financiadoTotal': 'Total financed amount',
  'smart.valorCuota': 'Amount of each instalment',
  'smart.totalConRecargo': 'Total payable with the surcharge',
  'smart.precioContado': 'Cash price',
  'smart.tituloFinanciado': 'Financed total',
  'smart.recargo': 'Surcharge:',
  'smart.sobreElContado': 'over the cash price',
  'smart.cuotasDe': '{cuotas} instalments of',
  'smart.porMesTotal': '/month (Total financed: {total})',
  'smart.confirmar': 'Confirm and save',
  'smart.descartar': 'Discard',

  'escaner.titulo': 'Receipt',
  'escaner.altPrevia': 'Receipt to be analysed',
  'escaner.leyendo': 'Reading the receipt…',
  'escaner.demora': 'It usually takes a few seconds.',
  'escaner.errorLectura': 'The receipt could not be read.',
  'escaner.errorConexion': 'Could not reach the server. Check your connection.',
  'escaner.errorImporte': 'The amount has to be a number greater than zero.',
  'escaner.comercio': 'Merchant',
  'escaner.importeTotal': 'Total amount',
  'escaner.monedaDelComprobante': 'Receipt currency',
  'escaner.sinCuentas': 'No accounts in {moneda}',
  'escaner.esTarjeta': '(card)',
  'escaner.avisoCuotas':
    '{cuotas} instalments of {monto} will be created, one per month. The amount above is the total for the purchase.',
  'escaner.avisoMoneda':
    'This transaction goes to your {moneda} book and you are looking at {actual}: it will not show up in the list until you switch currency in the header.',
  'escaner.guardar': 'Save transaction',

  'importador.nuevos': 'New',
  'importador.registrados': 'Already recorded',
  'importador.diferencias': 'Adjustments / Differences',
  'importador.leyendoArchivo': 'Reading {archivo}…',
  'importador.extrayendo':
    'The AI is extracting the charges. It can take up to a minute.',
  'importador.arrastra': 'Drop your card statement here',
  'importador.formatos': 'PDF or photo, up to 8 MB',
  'importador.elegirArchivo': 'Choose a file',
  'importador.sinConsumos': 'No charges were detected in the file.',
  'importador.errorArchivo': 'The file could not be processed. Try again.',
  'importador.importados': '{cantidad} transactions imported.',
  'importador.detectados': '{cantidad} charges detected',
  'importador.cambiar': 'Change',
  'importador.resultado': 'Reconciliation result',
  'importador.sinEnPestana': 'No charges in this category.',
  'importador.importarFila': 'Import {descripcion}',
  'importador.cuotaDe': 'instalment {actual}/{total}',
  'importador.yaRegistrado': 'already recorded on {fecha}',
  'importador.otroImporte': 'matches a transaction from {fecha} but for a different amount',
  'importador.tarjetaDelResumen': 'Card this statement belongs to',
  'importador.sinTarjetas': 'You have no cards set up',
  'importador.confirmarUna': 'Confirm and import 1 transaction',
  'importador.confirmarVarias': 'Confirm and import {cantidad} transactions',

  'inv.nueva': 'New investment',
  'inv.editarTitulo': 'Edit investment',
  'inv.placeholderNombre': 'Money market fund',
  'inv.tipoDeActivo': 'Asset type',
  'inv.montoInvertido': 'Amount invested',
  'inv.valorActual': 'Current value',
  'inv.igualAlInvertido': 'Same as invested',
  'inv.tna': 'Estimated annual rate (%)',
  'inv.tnaSufijo': '{tna}% p.a.',
  'inv.liquidez': 'Liquidity',
  'inv.ayudaLiquidez':
    'Only T+0 and T+1 count towards the rate the spending assistant uses: that is the money you can cash out in time to cover a purchase.',
  'inv.errorInvertido': 'Enter how much you invested.',
  'inv.errorTna': 'The annual rate cannot be negative.',
  'inv.registrar': 'Add an investment',
  'inv.activosEn': 'Assets in {moneda}',
  'inv.sinActivos': 'You have not added any investments yet.',
  'inv.sinActivosPista':
    'Add them and the spending assistant uses your real rate instead of an estimate.',

  'cuentas.agregar': 'Add an account or card',
  'cuentas.nueva': 'New account',
  'cuentas.editar': 'Edit account',
  'cuentas.placeholderTarjeta': 'Visa Platinum',
  'cuentas.placeholderCuenta': 'Current account',
  'cuentas.deudaActual': 'Current debt',
  'cuentas.saldoActual': 'Current balance',
  'cuentas.saldoInicial': 'Opening balance (optional)',
  'cuentas.ayudaDeuda': 'As a positive number: what you owe on this card today.',
  'cuentas.ayudaSaldo':
    'From here on your transactions keep it up to date; edit it only to correct it.',
  'cuentas.diaCierre': 'Closing day',
  'cuentas.diaVencimiento': 'Due day',
  'cuentas.limite': 'Limit (optional)',
  'cuentas.sinLimite': 'No limit',
  'cuentas.ultimosDigitos': 'Last 4 digits',
  'cuentas.banco': 'Bank (optional)',
  'cuentas.placeholderBanco': 'HSBC',
  'cuentas.errorSaldo': 'The balance has to be a number.',

  'deudas.nueva': 'New debt',
  'deudas.registrar': 'Add a debt or a loan',
  'deudas.tipoDeDeuda': 'Debt type',
  'deudas.quienTeDebe': 'Who owes you?',
  'deudas.aQuienLeDebes': 'Who do you owe?',
  'deudas.placeholderNombre': 'Name',
  'deudas.vence': 'Due date (optional)',
  'deudas.nota': 'Note (optional)',
  'deudas.placeholderNota': 'Dinner, loan…',
  'deudas.errorMonto': 'Enter a valid amount.',
  'deudas.meDebe': 'Owes me',
  'deudas.leDebo': 'I owe them',
  'deudas.venceEl': 'due {fecha}',
  'deudas.deTotal': 'of {monto}',
  'deudas.saldadoPorcentaje': '{porcentaje}% settled',
  'deudas.progresoDe': 'Settled with {nombre}',
  'deudas.registrarPago': 'Record a payment',
  'deudas.saldada': 'Settled',
  'deudas.contadorSaldada': '{cantidad} settled',
  'deudas.contadorSaldadas': '{cantidad} settled',
  'deudas.sinDeudas': 'You have no debts or loans recorded.',
  'deudas.borrar': 'Delete debt',

  'ajustes.sinGuardar': 'You have unsaved changes',
  'ajustes.descartar': 'Discard',
  'ajustes.barraAria': 'Unsaved changes',
  'ajustes.guardadoOk': 'Settings saved',
  'ajustes.cambioModulos': 'Modules',
  'ajustes.cambioRegion': 'Region',
  'ajustes.cambioIdioma': 'Language',
  'ajustes.avisoDiferido': 'Changes in this section apply once you confirm below.',

  'balance.patrimonioTotal': 'Total net worth',
  'balance.liquidezHoy': 'Liquid today',
  'balance.tarjetas': 'Cards · committed',
  'balance.inversiones': 'Investments and assets',
  'balance.venceEsteMes': 'Due this month:',
  'balance.alertaCorta': 'Your liquid money does not cover it',
  'balance.sinCotizacion': 'No exchange rate',
  'balance.sinCotizacionCorto': '{monedas} could not be priced: the books are not combined.',

  'evolutivo.titulo': 'Income vs. spending · 12 months',
  'evolutivo.sinDatos': 'No transactions in {moneda} yet to draw the series.',
  'accesos.titulo': 'Quick access',

  'tour.titulo': 'Guided tour',
  'tour.abrir': 'Take the guided tour',
  'tour.ayuda': 'Help and guided tour',
  'tour.anterior': 'Back',
  'tour.siguiente': 'Next',
  'tour.terminar': 'Done',
  'tour.saltar': 'Skip the tour',
  'tour.contador': 'Step {actual} of {total}',
  'tour.balanceTitulo': 'Your net worth, in one read',
  'tour.balanceCuerpo':
    'At the top, what you own in total. Below, the three layers behind it: what you can spend today, what is already committed on cards and what is invested. Card debt is NOT deducted from your liquid money — that spending does not leave your account until the due date.',
  'tour.entradaTitulo': 'Record an expense by talking',
  'tour.entradaCuerpo':
    'Type or dictate "spent 15 on groceries" and the AI builds the transaction: amount, category, date and account. Nothing is saved on its own — you always review before confirming.',
  'tour.gastoTitulo': 'Which card to pay with',
  'tour.gastoCuerpo':
    'AUREM reads each card closing day and tells you which one buys you the most time. And in the spending assistant you can weigh a cash discount against instalments, using the real rate of your own investments.',
  'tour.inversionesTitulo': 'Your real rate, not an estimate',
  'tour.inversionesCuerpo':
    'Add your investments with their annual rate and settlement term. Whatever settles same-day counts as liquid; the rest is net worth you cannot touch today. That distinction is what makes the spending assistant useful.',

  'excel.descargar': 'Download Excel',
  'excel.generando': 'Building the file…',
  'excel.error': 'Could not generate it. Try again',

  'compartidos.agregarInvitado': 'Add a guest',
  'compartidos.invitado': '(guest)',
  'compartidos.invitadoAyuda':
    'For splitting with someone who does not use AUREM. They take part in expenses and balances, but they cannot see the group.',
  'compartidos.nombreInvitadoVacio': 'Enter a name.',
  'compartidos.registrarPago': 'Record a payment',
  'compartidos.paga': 'Pays',
  'compartidos.cobra': 'Receives',
  'compartidos.pagoMismaPersona': 'Payer and receiver have to be different.',
  'compartidos.pagosRegistrados': 'Payments recorded',

  'grupoObjetivos.titulo': 'Group goals',
  'grupoObjetivos.nuevo': 'New goal',
  'grupoObjetivos.sinObjetivos': 'No goals in this group yet.',
  'grupoObjetivos.sinTitulo': 'Enter a title.',
  'grupoObjetivos.placeholderTitulo': 'Summer house rental',
  'grupoObjetivos.tipoAhorro': 'Joint savings',
  'grupoObjetivos.tipoPresupuesto': 'Category budget',
  'grupoObjetivos.aporteMensual': 'Monthly contribution',
  'grupoObjetivos.presupuestoNoDisponible':
    'Category budgets cannot be added here yet: the category picker is missing.',

  'inv.totalInvertido': 'Total invested',
  'inv.sobreLoInvertido': 'against cost',
  'inv.tnaPonderada': 'Weighted liquid rate',
  'inv.tnaAlimenta':
    'This rate feeds the Smart Spending comparison when weighing instalment purchases.',
  'inv.gananciaPasiva': 'Estimated monthly income',
  'inv.gananciaPasivaDetalle': 'What your portfolio earns per month at the rate you entered.',
  'inv.distribucion': 'Breakdown by type',
  'inv.entidad': 'Held at',
  'inv.placeholderEntidad': 'Interactive Brokers, Binance…',
  'inv.rendimientoProyectado': 'Estimated monthly return',
  'inv.rendimientoFormula': 'Amount × rate ÷ 12 (30/365 basis)',
  'inv.elegiTipo': 'What kind of asset is it',
  'inv.plazoSugerido': 'The usual settlement term was pre-filled. You can change it.',

  'inv.badge.MONEY_MARKET': 'Money market',
  'inv.badgeDetalle.MONEY_MARKET':
    'Same-day redemption, 24/7. Counts straight towards your Liquid Today on the home screen.',
  'inv.badge.FIXED_INCOME': 'Fixed income and repos',
  'inv.badgeDetalle.FIXED_INCOME':
    'Settles in 24 or 48 h: bonds, bills, repos. Counts as investment, not as liquidity.',
  'inv.badge.TIME_DEPOSIT': 'Fixed-term deposit',
  'inv.badgeDetalle.TIME_DEPOSIT': 'Capital locked until maturity.',
  'inv.badge.STOCKS_CEDEARS': 'Stocks and ETFs',
  'inv.badgeDetalle.STOCKS_CEDEARS': 'Listed equity.',
  'inv.badge.CRYPTO': 'Crypto and stablecoins',
  'inv.badgeDetalle.CRYPTO': 'USDT, USDC, BTC, ETH.',
  'inv.badge.REAL_ESTATE': 'Real estate',
  'inv.badgeDetalle.REAL_ESTATE': 'Property: not something you cash out to cover a purchase.',

  'tour.invTitulo': 'How to read your investments',
  'tour.invLiquidezTitulo': 'T+0 is not the same as T+1',
  'tour.invLiquidezCuerpo':
    'Whatever settles same-day (money market) counts towards Liquid Today on the home screen: that is money you can spend. Anything settling in 24 or 48 h stays under Investments. The difference is not accounting, it is practical: one of them decides what you can pay for today.',
  'tour.invTnaTitulo': 'What the weighted rate is for',
  'tour.invTnaCuerpo':
    'AUREM averages the rate of your liquid assets weighted by amount. With 800,000 at 70% and 200,000 at 30%, your real rate is 62%: that is the number the assistant compares against the cost of paying in instalments. If instalments cost more than that, paying cash wins.',
  'tour.invPasivaTitulo': 'Your passive income',
  'tour.invPasivaCuerpo':
    'The estimated monthly income is what your portfolio generates without you doing anything. It is a projection at the rate you entered, not a measured return: if that rate is stale, so is this number.',

  'sidebar.plegar': 'Collapse the menu',
  'sidebar.desplegar': 'Expand the menu',
  'presupuestos.detalle': 'Spending caps by category',
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
