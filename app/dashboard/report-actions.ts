'use server'

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

/**
 * Reporte de bug desde el modal "Acerca de AUREM".
 *
 * DÓNDE TERMINA ESTO
 *
 * En los logs del servidor (Vercel → Logs, filtrando por `[bug-report]`). No
 * hay tabla ni envío de mail, y es una decisión consciente: una tabla pedía
 * otra migración, y mandar mail pide un proveedor de SMTP que el proyecto
 * todavía no tiene.
 *
 * La consecuencia hay que tenerla presente: los reportes NO son consultables
 * con SQL y se pierden cuando rotan los logs (Vercel guarda 1 h en el plan
 * Hobby). Para algo duradero hace falta una tabla `bug_reports`. Por eso el
 * modal muestra también el mail de contacto: para lo urgente, ese camino no
 * depende de esto.
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

  console.error(
    '[bug-report]',
    JSON.stringify({
      version: VERSION,
      usuario: user?.email ?? 'anónimo',
      userId: user?.id ?? null,
      ruta: datos.data.ruta ?? null,
      mensaje: datos.data.mensaje,
      fecha: new Date().toISOString(),
    })
  )

  return { mensaje: 'Reporte enviado. Gracias: lo vamos a revisar.' }
}
