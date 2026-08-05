'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CATALOGO_MONEDAS, normalizarListaDeMonedas } from '@/lib/monedas'
import { guardarPerfil } from '@/lib/profile-service'
import { createClient } from '@/lib/supabase/server'
import type { Moneda } from '@/lib/types'

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

  // El perfil guarda el mismo nombre: es la fuente de verdad desde el
  // onboarding, y si los dos se desincronizan gana el que se lea primero.
  // Que falle no invalida el cambio: `user_metadata` ya se guardó.
  await guardarPerfil(supabase, user.id, { display_name: datos.data.nombre || null })

  // El nombre lo lee el layout del dashboard para el avatar y el menú.
  revalidatePath('/dashboard', 'layout')

  return {
    mensaje: cambiaElEmail
      ? `Listo. Te mandamos un mail a ${datos.data.email} para confirmar la dirección nueva: hasta que lo abras, seguís entrando con la anterior.`
      : 'Perfil actualizado.',
  }
}

// --- Divisas de trabajo y onboarding ----------------------------------------

const CODIGOS = CATALOGO_MONEDAS.map((m) => m.codigo)

const divisasSchema = z
  .array(z.string())
  .min(1, 'Elegí al menos una divisa.')
  .max(8, 'Son demasiadas divisas.')
  .refine((lista) => lista.every((codigo) => CODIGOS.includes(codigo)), {
    message: 'Hay una divisa que la app todavía no maneja.',
  })

/**
 * Guarda las divisas de trabajo.
 *
 * Recibe el array directo y no un FormData porque Ajustes guarda al toque, sin
 * botón: el componente llama a esto en cada cambio de chip.
 *
 * El ORDEN importa y se respeta: la primera es la divisa principal, la que
 * usa el consolidado para expresar el total unificado.
 */
export async function guardarDivisas(monedas: Moneda[]): Promise<EstadoDePerfil> {
  const datos = divisasSchema.safeParse(monedas)
  if (!datos.success) return { error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const resultado = await guardarPerfil(supabase, user.id, {
    selected_currencies: normalizarListaDeMonedas(datos.data),
  })

  if (!resultado.ok) return { error: resultado.error }

  // Cambiar las divisas cambia el filtro de TODAS las vistas, no solo de esta.
  revalidatePath('/dashboard', 'layout')

  return { mensaje: 'Divisas actualizadas.' }
}

const onboardingSchema = z.object({
  nombre: z.string().trim().min(1, 'Decinos cómo querés que te llamemos.').max(80, 'El nombre es muy largo.'),
  monedas: divisasSchema,
})

/**
 * Cierra el onboarding: nombre visible + divisas, en una sola escritura.
 *
 * El nombre se guarda en los dos lados a propósito: en `user_profiles` porque
 * es la fuente de verdad del perfil, y en `user_metadata` porque es de donde
 * el layout ya lee el nombre del avatar y del menú. Duplicarlo acá evita
 * tocar todo lo que hoy lee `user_metadata`.
 */
export async function completarOnboarding(entrada: {
  nombre: string
  monedas: Moneda[]
}): Promise<EstadoDePerfil> {
  const datos = onboardingSchema.safeParse(entrada)
  if (!datos.success) return { error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const resultado = await guardarPerfil(supabase, user.id, {
    display_name: datos.data.nombre,
    selected_currencies: normalizarListaDeMonedas(datos.data.monedas),
    onboarding_completed: true,
  })

  if (!resultado.ok) return { error: resultado.error }

  // Si esto falla, el onboarding igual quedó cerrado: el nombre del avatar es
  // secundario frente a no dejar al usuario encerrado en el modal.
  const { error: errorMetadata } = await supabase.auth.updateUser({
    data: { full_name: datos.data.nombre },
  })
  if (errorMetadata) {
    console.error('[onboarding] no se pudo copiar el nombre a user_metadata', errorMetadata.message)
  }

  revalidatePath('/dashboard', 'layout')

  return { mensaje: '¡Listo!' }
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
