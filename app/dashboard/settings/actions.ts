'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CATALOGO_LOCALES, normalizarLocale, type Locale } from '@/lib/formatters'
import { CATALOGO_IDIOMAS, normalizarIdioma } from '@/lib/i18n'
import { normalizarModulos, type EstadoDeModulos } from '@/lib/modules'
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

const localeSchema = z
  .string()
  .refine((valor) => CATALOGO_LOCALES.some((l) => l.codigo === valor), {
    message: 'Esa región todavía no está soportada.',
  })

/**
 * Guarda la región que define el formato de números y fechas.
 *
 * REEMPLAZADA POR `guardarAjustes` — Ajustes ya no la llama: región, idioma y
 * módulos van juntos en un lote confirmado por el usuario. Se conserva porque
 * sigue siendo una acción válida y autónoma, y borrar un endpoint público para
 * ahorrar veinte líneas rompe a cualquiera que la esté usando.
 */
export async function guardarLocale(locale: string): Promise<EstadoDePerfil> {
  const datos = localeSchema.safeParse(locale)
  if (!datos.success) return { error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const resultado = await guardarPerfil(supabase, user.id, {
    locale: normalizarLocale(datos.data),
  })

  if (!resultado.ok) return { error: resultado.error }

  // El formato lo aplica el provider, que sale del layout: hay que revalidarlo
  // entero para que baje el locale nuevo.
  revalidatePath('/dashboard', 'layout')

  return { mensaje: 'Región actualizada.' }
}

const idiomaSchema = z
  .string()
  .refine((valor) => CATALOGO_IDIOMAS.some((i) => i.codigo === valor), {
    message: 'Ese idioma todavía no está soportado.',
  })

/**
 * Guarda el idioma de la interfaz.
 *
 * REEMPLAZADA POR `guardarAjustes`, igual que `guardarLocale`. La confirmación
 * que antes daba el modal ahora la da la barra de cambios sin guardar, que
 * cubre el mismo riesgo: cambiar el idioma reescribe el botón que hace falta
 * para volver atrás, así que nada tiene que cambiar hasta que el usuario
 * confirme.
 */
export async function guardarIdioma(idioma: string): Promise<EstadoDePerfil> {
  const datos = idiomaSchema.safeParse(idioma)
  if (!datos.success) return { error: datos.error.issues[0].message }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const resultado = await guardarPerfil(supabase, user.id, {
    language: normalizarIdioma(datos.data),
  })

  if (!resultado.ok) return { error: resultado.error }

  revalidatePath('/dashboard', 'layout')

  return { mensaje: 'Idioma actualizado.' }
}

/**
 * Guarda qué módulos quedan activos.
 *
 * REEMPLAZADA POR `guardarAjustes`. Era la peor de las tres para disparar por
 * toque: cada switch revalidaba el layout entero, y apagar tres módulos
 * reconstruía la navegación tres veces seguidas.
 *
 * `normalizarModulos` descarta las claves que no son módulos y las de los
 * fijos: el cliente manda un objeto y no hay razón para confiar en su forma.
 */
export async function guardarModulos(estado: EstadoDeModulos): Promise<EstadoDePerfil> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const resultado = await guardarPerfil(supabase, user.id, {
    active_modules: normalizarModulos(estado),
  })

  if (!resultado.ok) return { error: resultado.error }

  // La navegación se arma en el layout: hay que revalidarlo entero.
  revalidatePath('/dashboard', 'layout')

  return { mensaje: 'Módulos actualizados.' }
}

// --- Guardado en lote (confirmación diferida) --------------------------------

const modulosSchema = z.record(z.string(), z.boolean())

/**
 * Los tres ajustes que Ajustes edita en borrador, en una sola escritura.
 *
 * `partial()` no es laxitud: la barra de guardado manda SOLO lo que cambió. Si
 * el usuario tocó módulos y no el idioma, mandar el idioma actual sería
 * escribir un valor que nadie pidió cambiar, y pisaría el que haya guardado
 * otra pestaña en el medio.
 */
const ajustesSchema = z
  .object({
    locale: localeSchema,
    idioma: idiomaSchema,
    modulos: modulosSchema,
  })
  .partial()

export type AjustesAGuardar = z.infer<typeof ajustesSchema>

/**
 * Guarda módulos, región e idioma juntos.
 *
 * POR QUÉ EN LOTE Y NO TRES ACTIONS
 *
 * Antes cada switch disparaba su propia action, y cada action hacía su upsert,
 * su `revalidatePath('/dashboard', 'layout')` y su `router.refresh()`. Apagar
 * tres módulos eran tres viajes al servidor y tres reconstrucciones del layout
 * entero —barra inferior, bandeja "Más", providers— con el parpadeo
 * correspondiente en cada una.
 *
 * Acá es UN upsert y UNA revalidación, dispare lo que dispare el usuario. El
 * costo de la latencia se paga una vez, cuando se confirma, y no en cada toque.
 */
export async function guardarAjustes(entrada: AjustesAGuardar): Promise<EstadoDePerfil> {
  const datos = ajustesSchema.safeParse(entrada)
  if (!datos.success) return { error: datos.error.issues[0].message }

  const { locale, idioma, modulos } = datos.data

  // Nada que hacer: la barra no debería llegar acá con el borrador limpio, pero
  // un upsert vacío igual tocaría `updated_at` y revalidaría el layout de gusto.
  if (locale === undefined && idioma === undefined && modulos === undefined) {
    return { mensaje: 'No había cambios para guardar.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const resultado = await guardarPerfil(supabase, user.id, {
    ...(locale !== undefined ? { locale: normalizarLocale(locale) } : {}),
    ...(idioma !== undefined ? { language: normalizarIdioma(idioma) } : {}),
    // `normalizarModulos` descarta claves que no son módulos y las de los
    // fijos: el cliente manda un objeto y no hay razón para confiar en su forma.
    ...(modulos !== undefined ? { active_modules: normalizarModulos(modulos) } : {}),
  })

  if (!resultado.ok) return { error: resultado.error }

  // Idioma, formato y navegación los baja el layout a través del provider: hay
  // que revalidarlo entero o la app sigue mostrando lo anterior.
  revalidatePath('/dashboard', 'layout')

  return { mensaje: 'Ajustes guardados.' }
}

const onboardingSchema = z.object({
  nombre: z.string().trim().min(1, 'Decinos cómo querés que te llamemos.').max(80, 'El nombre es muy largo.'),
  monedas: divisasSchema,
  locale: localeSchema,
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
  locale: Locale
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
    locale: normalizarLocale(datos.data.locale),
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
