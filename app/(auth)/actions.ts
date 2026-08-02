'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type EstadoAuth = {
  error?: string
  mensaje?: string
  /** Email a la espera de confirmación; habilita el bloque de reenvío. */
  emailPendiente?: string
}

const credencialesSchema = z.object({
  email: z.email('Ingresá un email válido.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
})

/** Solo permitimos rutas internas para evitar open redirects. */
function destinoSeguro(valor: FormDataEntryValue | null): string {
  const ruta = typeof valor === 'string' ? valor : ''
  return ruta.startsWith('/') && !ruta.startsWith('//') ? ruta : '/dashboard'
}

export async function iniciarSesion(
  _estadoPrevio: EstadoAuth,
  formData: FormData
): Promise<EstadoAuth> {
  const datos = credencialesSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!datos.success) {
    return { error: datos.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(datos.data)

  if (error) {
    return {
      error:
        error.code === 'invalid_credentials'
          ? 'Email o contraseña incorrectos.'
          : error.code === 'email_not_confirmed'
            ? 'Todavía no confirmaste tu email. Revisá tu casilla.'
            : error.message,
    }
  }

  revalidatePath('/', 'layout')
  redirect(destinoSeguro(formData.get('redirectTo')))
}

export async function registrarse(
  _estadoPrevio: EstadoAuth,
  formData: FormData
): Promise<EstadoAuth> {
  const datos = credencialesSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!datos.success) {
    return { error: datos.error.issues[0].message }
  }

  const supabase = await createClient()
  const cabeceras = await headers()
  const origen = cabeceras.get('origin') ?? 'http://localhost:3000'

  const { data, error } = await supabase.auth.signUp({
    ...datos.data,
    options: { emailRedirectTo: `${origen}/auth/callback` },
  })

  if (error) {
    return {
      error:
        error.code === 'user_already_exists'
          ? 'Ya existe una cuenta con ese email. Probá iniciando sesión.'
          : error.message,
    }
  }

  // Con confirmación de email activada, signUp NO devuelve sesión: Supabase
  // manda el mail y el usuario entra recién al hacer clic en el enlace.
  if (!data.session) {
    return {
      mensaje: 'Te mandamos un email de confirmación. Abrí el enlace para activar tu cuenta.',
      emailPendiente: datos.data.email,
    }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export type ResultadoReenvio = {
  ok: boolean
  mensaje: string
  /** Segundos que pide esperar Supabase cuando corta por rate limit. */
  esperarSegundos?: number
}

/** Vuelve a mandar el mail de confirmación de una cuenta sin verificar. */
export async function reenviarConfirmacion(email: string): Promise<ResultadoReenvio> {
  const parseado = z.email().safeParse(email)
  if (!parseado.success) {
    return { ok: false, mensaje: 'Email inválido.' }
  }

  const supabase = await createClient()
  const cabeceras = await headers()
  const origen = cabeceras.get('origin') ?? 'http://localhost:3000'

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: parseado.data,
    options: { emailRedirectTo: `${origen}/auth/callback` },
  })

  if (error) {
    // Supabase limita los envíos por dirección (con el SMTP integrado suele ser
    // 1 cada 60s) y devuelve el tiempo restante dentro del mensaje.
    if (error.code === 'over_email_send_rate_limit') {
      const segundos = Number(error.message.match(/(\d+)\s*seconds?/i)?.[1] ?? 60)
      return {
        ok: false,
        mensaje: `Esperá ${segundos} segundos antes de pedir otro email.`,
        esperarSegundos: segundos,
      }
    }

    console.error('[reenviarConfirmacion]', error)
    return { ok: false, mensaje: 'No se pudo reenviar el email. Intentá en un rato.' }
  }

  return { ok: true, mensaje: 'Listo, te reenviamos el email de confirmación.' }
}

export async function cerrarSesion() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
