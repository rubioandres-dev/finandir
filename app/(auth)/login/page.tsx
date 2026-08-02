import type { Metadata } from 'next'
import { iniciarSesion } from '../actions'
import { AuthForm } from '../auth-form'

export const metadata: Metadata = { title: 'Iniciar sesión' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>
}) {
  const { redirectTo, error } = await searchParams

  return (
    <AuthForm modo="login" accion={iniciarSesion} redirectTo={redirectTo} errorInicial={error} />
  )
}
