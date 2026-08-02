import { google } from '@ai-sdk/google'
import { APICallError, NoObjectGeneratedError, RetryError, generateObject } from 'ai'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Modelo de Gemini a usar.
 *
 * OJO: `gemini-2.0-flash` ya no tiene cuota gratuita (la API responde 429 con
 * `free_tier_requests limit: 0`). Si tenés billing habilitado en el proyecto de
 * Google Cloud, podés volver a él con GEMINI_MODEL=gemini-2.0-flash.
 */
const MODEL_ID = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash'

/** Debe coincidir con las categorías sembradas por schema.sql. */
const CATEGORIES = [
  'Comida',
  'Transporte',
  'Servicios',
  'Sueldo',
  'Ocio',
  'Educación',
  'Salud',
  'Otros',
] as const

const requestSchema = z.object({
  text: z.string().trim().min(1, 'El texto no puede estar vacío').max(500),
  /** Cuentas del usuario, para que el modelo pueda elegir con cuál se pagó. */
  accounts: z
    .array(
      z.object({
        name: z.string().max(80),
        type: z.string().max(20),
        currency: z.string().max(3),
      })
    )
    .max(30)
    .optional(),
})

const transactionSchema = z.object({
  amount: z
    .number()
    .positive()
    .describe(
      'Importe SIEMPRE positivo, sin símbolo de moneda ni separadores de miles. ' +
        'Interpretá los atajos coloquiales: "2 lucas" = 2000, "1.5k" = 1500, ' +
        '"1.500,50" (formato es-AR) = 1500.5'
    ),
  type: z
    .enum(['INCOME', 'EXPENSE', 'TRANSFER'])
    .describe(
      'EXPENSE si el usuario gastó o pagó algo (caso más común). ' +
        'INCOME si cobró o recibió dinero. ' +
        'TRANSFER solo si mueve dinero entre dos cuentas propias.'
    ),
  currency: z
    .enum(['ARS', 'USD'])
    .describe(
      'Moneda del movimiento. Por defecto ARS. Devolvé USD solo si el texto lo ' +
        'dice explícitamente: "USD", "dólares", "dolares", "verdes", "u$s", "US$". ' +
        'Ojo: en Argentina "$" solo significa pesos, nunca dólares.'
    ),
  category_suggested: z
    .enum(CATEGORIES)
    .describe('La categoría que mejor encaje. Usá "Otros" si ninguna aplica.'),
  description: z
    .string()
    .min(1)
    .max(120)
    .describe(
      'Descripción corta y prolija del movimiento, sin el importe. ' +
        'Ej: "Compra en el supermercado"'
    ),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('Fecha del movimiento en formato YYYY-MM-DD'),
  installment_total: z
    .number()
    .int()
    .min(1)
    .max(60)
    .describe(
      'Cantidad de cuotas. 1 si es un pago único (lo habitual). ' +
        'Devolvé otro número solo si la frase lo dice: "en 3 cuotas", "12 cuotas", ' +
        '"6 pagos", "3x". Ojo: "3 cuotas de 5000" son 3 cuotas y el importe total es 15000.'
    ),
  account_name: z
    .string()
    .nullable()
    .describe(
      'Nombre EXACTO de la cuenta o tarjeta con la que se pagó, tomado de la ' +
        'lista de cuentas disponibles. null si la frase no menciona ninguna.'
    ),
})

export type ParsedTransaction = z.infer<typeof transactionSchema>

/** Fecha de hoy en la zona horaria de Argentina (el server suele correr en UTC). */
function todayInBuenosAires(): string {
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'El body debe ser JSON válido.' }, { status: 400 })
  }

  const parsedBody = requestSchema.safeParse(body)
  if (!parsedBody.success) {
    return Response.json(
      { error: 'Body inválido.', issues: z.treeifyError(parsedBody.error) },
      { status: 400 }
    )
  }

  const today = todayInBuenosAires()
  const cuentas = parsedBody.data.accounts ?? []

  // Se le pasan las cuentas por nombre para que pueda resolver "con la Visa".
  const listaDeCuentas =
    cuentas.length > 0
      ? 'Cuentas disponibles del usuario (elegí una por su nombre exacto o null): ' +
        cuentas
          .map((c) => `"${c.name}" (${c.type === 'CREDIT_CARD' ? 'tarjeta de crédito' : 'cuenta'}, ${c.currency})`)
          .join(', ') +
        '.'
      : 'El usuario no tiene cuentas cargadas: devolvé account_name en null.'

  try {
    const { object } = await generateObject({
      model: google(MODEL_ID),
      schema: transactionSchema,
      schemaName: 'transaccion',
      schemaDescription: 'Movimiento financiero extraído de una frase en lenguaje natural',
      temperature: 0,
      system: [
        'Sos un asistente de finanzas personales para usuarios de Argentina.',
        'Extraés un único movimiento financiero a partir de una frase escrita en lenguaje natural.',
        `La fecha de hoy es ${today} (zona horaria America/Argentina/Buenos_Aires).`,
        'Resolvé las fechas relativas contra esa fecha: "hoy", "ayer", "el lunes pasado", "el 3".',
        'Si la frase no menciona ninguna fecha, usá la de hoy.',
        'La moneda por defecto es el peso argentino (ARS): en Argentina "$" y "pesos" son ARS.',
        'Marcá USD únicamente si el texto lo aclara ("USD", "dólares", "u$s", "US$", "verdes").',
        'El importe va siempre sin símbolo, solo el número, en la moneda que detectaste.',
        'Las cuotas van en installment_total: 1 salvo que la frase diga otra cantidad.',
        'Si mencionan una tarjeta o cuenta ("con la Visa", "con Mercado Pago"), devolvé su nombre exacto en account_name.',
        listaDeCuentas,
        'No inventes datos que no estén en la frase: si algo es ambiguo, elegí la opción más probable.',
      ].join(' '),
      prompt: parsedBody.data.text,
    })

    return Response.json(object)
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      return Response.json(
        { error: 'No se pudo interpretar el texto como un movimiento financiero.' },
        { status: 422 }
      )
    }

    // El SDK reintenta y envuelve el fallo en un RetryError: hay que mirar
    // adentro para distinguir un problema de cuota de un error genérico.
    const causa = RetryError.isInstance(error) ? error.lastError : error

    if (APICallError.isInstance(causa) && causa.statusCode === 429) {
      console.error(`[ai-parse] cuota agotada para el modelo ${MODEL_ID}`)
      return Response.json(
        {
          error: `Se agotó la cuota de la API de Gemini para el modelo ${MODEL_ID}. ` +
            'Revisá tu plan en https://ai.dev/rate-limit o probá con otro modelo (GEMINI_MODEL).',
        },
        { status: 429 }
      )
    }

    console.error('[ai-parse]', error)
    return Response.json({ error: 'Error al procesar el texto.' }, { status: 500 })
  }
}
