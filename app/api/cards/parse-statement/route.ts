import { google } from '@ai-sdk/google'
import { APICallError, NoObjectGeneratedError, RetryError, generateObject } from 'ai'
import { z } from 'zod'
import { CODIGOS_DE_MONEDA } from '@/lib/monedas'

export const runtime = 'nodejs'
// Un resumen de tarjeta puede tener decenas de consumos: dura más que un parseo
// de una sola frase.
export const maxDuration = 120

const MODEL_ID = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash'

/** 8 MB: un resumen de tarjeta típico pesa menos de 1 MB. */
const TAMANO_MAXIMO = 8 * 1024 * 1024

const TIPOS_ACEPTADOS = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
]

const consumoSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('Fecha del consumo en YYYY-MM-DD. Si el resumen no da el año, usá el del período.'),
  description: z
    .string()
    .min(1)
    .max(120)
    .describe('Nombre del comercio tal como figura, sin el importe ni los códigos internos.'),
  amount: z
    .number()
    .describe(
      'Importe del consumo, siempre positivo. Es el valor de LA CUOTA si el consumo está en cuotas. ' +
        'Formato es-AR: "1.234,56" son 1234.56.'
    ),
  current_installment: z
    .number()
    .int()
    .nullable()
    .describe('Número de cuota, si el renglón dice "03/12" o "CUOTA 3 DE 12". null si es un pago único.'),
  total_installments: z
    .number()
    .int()
    .nullable()
    .describe('Total de cuotas del plan. null si es un pago único.'),
  currency: z
    .enum(CODIGOS_DE_MONEDA)
    .describe('Moneda del renglón. Los resúmenes argentinos suelen tener secciones separadas.'),
})

const respuestaSchema = z.object({
  statement_period: z
    .string()
    .nullable()
    .describe('Período del resumen en YYYY-MM, si figura.'),
  card_last_four: z
    .string()
    .nullable()
    .describe('Últimos 4 dígitos de la tarjeta, si figuran.'),
  transactions: z.array(consumoSchema),
})

export type ConsumoDeResumen = z.infer<typeof consumoSchema>
export type ResumenParseado = z.infer<typeof respuestaSchema>

export async function POST(request: Request) {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return Response.json(
      { error: 'Falta GOOGLE_GENERATIVE_AI_API_KEY en el entorno.' },
      { status: 500 }
    )
  }

  let archivo: File | null = null
  try {
    const form = await request.formData()
    const valor = form.get('file')
    if (valor instanceof File) archivo = valor
  } catch {
    return Response.json({ error: 'Mandá el archivo como multipart/form-data.' }, { status: 400 })
  }

  if (!archivo) {
    return Response.json({ error: 'No llegó ningún archivo.' }, { status: 400 })
  }

  if (archivo.size === 0) {
    return Response.json({ error: 'El archivo está vacío.' }, { status: 400 })
  }

  if (archivo.size > TAMANO_MAXIMO) {
    return Response.json(
      { error: `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB. El máximo es 8 MB.` },
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

  try {
    const { object } = await generateObject({
      model: google(MODEL_ID),
      schema: respuestaSchema,
      schemaName: 'resumen_de_tarjeta',
      schemaDescription: 'Consumos extraídos de un resumen de tarjeta de crédito',
      temperature: 0,
      // El AI SDK v7 rechaza mensajes con role 'system' dentro de `messages`:
      // las instrucciones van como opción de nivel superior.
      system: [
        'Sos un asistente que lee resúmenes de tarjeta de crédito argentinos.',
        'Extraés ÚNICAMENTE los renglones de consumo: compras, débitos automáticos y cuotas.',
        'NO incluyas: pagos del resumen anterior, saldos, intereses, IVA, impuesto de sellos,',
        'percepciones de AFIP/ARBA, seguros de cartera, ni totales de ninguna clase.',
        'Los importes están en formato es-AR: el punto separa miles y la coma los decimales.',
        'Un renglón "03/12" o "CUOTA 3 DE 12" significa cuota 3 de un plan de 12.',
        'Si un renglón está en dólares, marcá currency USD; el resto es ARS.',
        'Si no podés leer un renglón con confianza, omitilo en vez de inventar datos.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraé todos los consumos de este resumen.' },
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
        { error: 'No se pudo leer el archivo como un resumen de tarjeta.' },
        { status: 422 }
      )
    }

    const causa = RetryError.isInstance(error) ? error.lastError : error

    if (APICallError.isInstance(causa) && causa.statusCode === 429) {
      console.error(`[parse-statement] cuota agotada para ${MODEL_ID}`)
      return Response.json(
        {
          error: `Se agotó la cuota de la API de Gemini para el modelo ${MODEL_ID}. ` +
            'Revisá tu plan o probá con otro modelo (GEMINI_MODEL).',
        },
        { status: 429 }
      )
    }

    console.error('[parse-statement]', error)
    return Response.json({ error: 'Error al procesar el resumen.' }, { status: 500 })
  }
}
