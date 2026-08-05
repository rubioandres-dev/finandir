'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type EstadoDePerfil = {
  error?: string
  mensaje?: string
}

const perfilSchema = z.object({
  // Vacío es válido: significa "no quiero mostrar nombre".
  nombre: z.string().trim().max(80, 'El nombre es muy largo.'),
  email: z.email('Ingresá un email válido.'),
})

/**
 * Nombre visible y email de la cuenta.
 *
 * El nombre va a `user_metadata`, que es parte del usuario de Supabase auth:
 * no hace falta una tabla `profiles` ni una migración para algo que es un
 * único campo de texto.
 */
export async function actualizarPerfil(
  _estadoPrevio: EstadoDePerfil,
  formData: FormData
): Promise<EstadoDePerfil> {
  const datos = perfilSchema.safeParse({
    nombre: formData.get('nombre'),
    email: formData.get('email'),
  })

  if (!datos.success) return { error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const cambiaElEmail = datos.data.email !== user.email

  const { error } = await supabase.auth.updateUser({
    data: { full_name: datos.data.nombre || null },
    // Mandar el mismo email dispara una confirmación innecesaria.
    ...(cambiaElEmail ? { email: datos.data.email } : {}),
  })

  if (error) {
    return {
      error:
        error.code === 'email_exists'
          ? 'Ese email ya está en uso.'
          : `No se pudo guardar: ${error.message}`,
    }
  }

  // El nombre lo lee el layout del dashboard para el avatar y el menú.
  revalidatePath('/dashboard', 'layout')

  return {
    mensaje: cambiaElEmail
      ? `Listo. Te mandamos un mail a ${datos.data.email} para confirmar la dirección nueva: hasta que lo abras, seguís entrando con la anterior.`
      : 'Perfil actualizado.',
  }
}

const contrasenaSchema = z
  .object({
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
    repetida: z.string(),
  })
  .refine((d) => d.password === d.repetida, {
    message: 'Las contraseñas no coinciden.',
    path: ['repetida'],
  })

export async function cambiarContrasena(
  _estadoPrevio: EstadoDePerfil,
  formData: FormData
): Promise<EstadoDePerfil> {
  const datos = contrasenaSchema.safeParse({
    password: formData.get('password'),
    repetida: formData.get('repetida'),
  })

  if (!datos.success) return { error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const { error } = await supabase.auth.updateUser({ password: datos.data.password })

  if (error) {
    return {
      error:
        error.code === 'same_password'
          ? 'Esa ya es tu contraseña actual.'
          : `No se pudo cambiar la contraseña: ${error.message}`,
    }
  }

  return { mensaje: 'Contraseña actualizada.' }
}
