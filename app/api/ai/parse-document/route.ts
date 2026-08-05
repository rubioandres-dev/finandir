import { google } from '@ai-sdk/google'
import { APICallError, NoObjectGeneratedError, RetryError, generateObject } from 'ai'
import { z } from 'zod'
import { CODIGOS_DE_MONEDA } from '@/lib/monedas'

export const runtime = 'nodejs'
// Un comprobante es una sola operación, pero una foto de ticket sacada a mano
// puede venir torcida y con poca luz: el modelo tarda más que con texto plano.
export const maxDuration = 60

const MODEL_ID = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash'

/** 8 MB, el mismo tope que el importador de resúmenes. */
const TAMANO_MAXIMO = 8 * 1024 * 1024

const TIPOS_ACEPTADOS = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
]

/**
 * Lectura de UN comprobante: ticket, factura, voucher de pago.
 *
 * Es distinto de `/api/cards/parse-statement`, que lee un resumen entero y
 * devuelve decenas de renglones. Acá se espera una sola operación, y el
 * usuario la confirma antes de guardarla.
 */
const comprobanteSchema = z.object({
  merchant: z
    .string()
    .min(1)
    .max(120)
    .describe(
      'Nombre del comercio o emisor, tal como figura. Sin CUIT, sin dirección ' +
        'y sin la razón social completa si hay un nombre de fantasía visible.'
    ),
  total_amount: z
    .number()
    .positive()
    .describe(
      'IMPORTE TOTAL PAGADO, con impuestos incluidos. Es el renglón "TOTAL", no ' +
        'el subtotal ni el valor de un ítem suelto. Formato es-AR: "1.234,56" son 1234.56. ' +
        'Si el comprobante está en cuotas, este es el TOTAL de la operación, no el de la cuota.'
    ),
  currency: z
    .enum(CODIGOS_DE_MONEDA)
    .describe('Moneda del comprobante. En Argentina "$" es ARS; USD solo si lo aclara.'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('Fecha de la operación en YYYY-MM-DD. Si no figura, usá la fecha de hoy.'),
  category_name: z
    .string()
    .min(1)
    .max(60)
    .describe(
      'Categoría de gasto que mejor encaje, elegida de la lista que se te da. ' +
        'Usá "Otros" si ninguna aplica.'
    ),
  is_installment: z
    .boolean()
    .describe('true solo si el comprobante dice explícitamente que se pagó en cuotas.'),
  current_installment: z
    .number()
    .int()
    .min(1)
    .max(60)
    .nullable()
    .describe('Número de cuota si dice "cuota 3 de 12" o "03/12". null si es pago único.'),
  total_installments: z
    .number()
    .int()
    .min(1)
    .max(60)
    .nullable()
    .describe('Total de cuotas del plan. null si es pago único.'),
})

export type ComprobanteParseado = z.infer<typeof comprobanteSchema>

/** Fecha de hoy en Argentina; el server suele correr en UTC. */
function hoyEnArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export async function POST(request: Request) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      { error: 'Falta GOOGLE_GENERATIVE_AI_API_KEY en el entorno.' },
      { status: 500 }
    )
  }

  let archivo: File | null = null
  let categorias: string[] = []

  try {
    const form = await request.formData()
    const valor = form.get('file')
    if (valor instanceof File) archivo = valor

    // Las categorías del usuario viajan con el pedido: si el modelo eligiera
    // de una lista fija, cada categoría personalizada terminaría en "Otros".
    const crudas = form.get('categories')
    if (typeof crudas === 'string' && crudas.trim()) {
      categorias = crudas
        .split('\n')
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 60)
    }
  } catch {
    return Response.json({ error: 'Mandá el archivo como multipart/form-data.' }, { status: 400 })
  }

  if (!archivo) return Response.json({ error: 'No llegó ningún archivo.' }, { status: 400 })
  if (archivo.size === 0) return Response.json({ error: 'El archivo está vacío.' }, { status: 400 })

  if (archivo.size > TAMANO_MAXIMO) {
    return Response.json(
      {
        error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB. El máximo es 8 MB.`,
      },
      { status: 413 }
    )
  }

  const tipo = archivo.type || 'application/pdf'
  if (!TIPOS_ACEPTADOS.includes(tipo)) {
    return Response.json(
      { error: `Tipo de archivo no soportado (${tipo}). Subí un PDF o una imagen.` },
      { status: 415 }
    )
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer())
  const hoy = hoyEnArgentina()

  const listaDeCategorias =
    categorias.length > 0
      ? `Elegí category_name EXACTAMENTE de esta lista: ${categorias.join(', ')}.`
      : 'Devolvé category_name como "Otros".'

  try {
    const { object } = await generateObject({
      model: google(MODEL_ID),
      schema: comprobanteSchema,
      schemaName: 'comprobante',
      schemaDescription: 'Datos de un comprobante de pago (ticket, factura o voucher)',
      temperature: 0,
      // El AI SDK v7 rechaza mensajes con role 'system' dentro de `messages`:
      // las instrucciones van como opción de nivel superior.
      system: [
        'Sos un asistente que lee comprobantes de pago argentinos: tickets, facturas A/B/C y vouchers de posnet.',
        'Extraés UNA sola operación: la del comprobante que ves.',
        `La fecha de hoy es ${hoy} (America/Argentina/Buenos_Aires); usala si el comprobante no trae fecha.`,
        'El importe que importa es el TOTAL final, con IVA y recargos ya incluidos.',
        'Los importes están en formato es-AR: el punto separa miles y la coma los decimales.',
        'Un renglón "03/12" o "CUOTA 3 DE 12" significa cuota 3 de un plan de 12.',
        listaDeCategorias,
        'Si un dato no está en el comprobante, no lo inventes: usá el default que indica cada campo.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraé los datos de este comprobante.' },
            tipo === 'application/pdf'
              ? { type: 'file' as const, data: bytes, mediaType: tipo }
              : { type: 'image' as const, image: bytes, mediaType: tipo },
          ],
        },
      ],
    })

    return Response.json(object)
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      return Response.json(
        { error: 'No se pudo leer el archivo como un comprobante de pago.' },
        { status: 422 }
      )
    }

    // El SDK reintenta y envuelve el fallo en un RetryError: hay que mirar
    // adentro para distinguir un problema de cuota de un error genérico.
    const causa = RetryError.isInstance(error) ? error.lastError : error

    if (APICallError.isInstance(causa) && causa.statusCode === 429) {
      console.error(`[parse-document] cuota agotada para ${MODEL_ID}`)
      return Response.json(
        {
          error:
            `Se agotó la cuota de la API de Gemini para el modelo ${MODEL_ID}. ` +
            'Revisá tu plan o probá con otro modelo (GEMINI_MODEL).',
        },
        { status: 429 }
      )
    }

    console.error('[parse-document]', error)
    return Response.json({ error: 'Error al procesar el comprobante.' }, { status: 500 })
  }
}
