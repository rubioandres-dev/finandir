'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { VERSION } from '@/lib/version'

export type EstadoDeReporte = { error?: string; mensaje?: string }

const reporteSchema = z.object({
  mensaje: z
    .string()
    .trim()
    .min(10, 'Contanos un poco más: al menos 10 caracteres.')
    .max(2000, 'El reporte es muy largo. Resumilo en 2000 caracteres.'),
  /** Ruta desde donde se reportó, para poder reproducirlo. */
  ruta: z.string().max(200).optional(),
})

/** Códigos con los que PostgREST/Postgres avisan que falta la tabla. */
function faltaLaTabla(codigo?: string): boolean {
  return codigo === 'PGRST205' || codigo === 'PGRST204' || codigo === '42P01'
}

/**
 * Deja el reporte en los logs.
 *
 * Es la RED, no el camino principal: corre cuando el insert falla o cuando
 * todavía no se corrió la 014. Vale poco —los logs de runtime de Vercel duran
 * una hora en Hobby— pero perder el reporte del todo vale menos.
 */
function alLog(payload: Record<string, unknown>, motivo: string) {
  console.error('[bug-report]', motivo, JSON.stringify(payload))
}

/**
 * Reporte de bug desde el modal "Acerca de AUREM".
 *
 * DÓNDE TERMINA ESTO
 *
 * En la tabla `bug_reports` (migración 014). Antes era sólo un `console.error`,
 * y eso significaba que el reporte vivía lo que viven los logs de runtime de
 * Vercel: una hora en el plan Hobby, sin forma de consultarlo con SQL. Mientras
 * tanto la app respondía "lo vamos a revisar".
 *
 * Se lee desde el Dashboard de Supabase: la tabla tiene política de INSERT y
 * NINGUNA de SELECT, así que la app no puede devolver reportes a nadie.
 *
 * POR QUÉ EL FALLO DEL INSERT NO SE LE MUESTRA AL USUARIO
 *
 * Alguien que acaba de escribir 300 palabras describiendo un bug no puede
 * recibir "no se pudo guardar" como respuesta: el texto se pierde igual y la
 * frustración se duplica. Si el insert falla, el reporte cae al log —que es
 * exactamente donde vivía antes— y el usuario ve el mismo acuse de siempre. Lo
 * que se rompió queda registrado con su motivo para poder mirarlo después.
 */
export async function enviarReporte(
  _estadoPrevio: EstadoDeReporte,
  formData: FormData
): Promise<EstadoDeReporte> {
  const datos = reporteSchema.safeParse({
    mensaje: formData.get('mensaje'),
    ruta: formData.get('ruta') ?? undefined,
  })

  if (!datos.success) return { error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // El navegador sale de las cabeceras y no de `navigator.userAgent`: así el
  // cliente no puede mentirlo con un campo oculto del formulario, y de paso el
  // modal no tiene que mandarlo.
  const cabeceras = await headers()
  const navegador = cabeceras.get('user-agent')?.slice(0, 400) ?? null

  const payload = {
    user_id: user?.id ?? null,
    reporter_email: user?.email ?? null,
    message: datos.data.mensaje,
    route: datos.data.ruta ?? null,
    app_version: VERSION,
    user_agent: navegador,
  }

  // Sin sesión no hay a quién atribuirlo y la política de RLS rechaza el insert
  // (`with check (auth.uid() = user_id)`). Va al log y listo: es el caso de la
  // sesión que venció con el modal abierto.
  if (!user) {
    alLog(payload, 'sin-sesion')
    return { mensaje: 'Reporte enviado. Gracias: lo vamos a revisar.' }
  }

  const { error } = await supabase.from('bug_reports').insert(payload)

  if (error) {
    alLog(
      payload,
      faltaLaTabla(error.code)
        ? 'falta-migracion-014'
        : `insert-fallido:${error.code ?? 'sin-codigo'}`
    )
  }

  return { mensaje: 'Reporte enviado. Gracias: lo vamos a revisar.' }
}
