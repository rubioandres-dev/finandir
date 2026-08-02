import type { Metadata } from 'next'
import { registrarse } from '../actions'
import { AuthForm } from '../auth-form'

export const metadata: Metadata = { title: 'Crear cuenta' }

export default function SignupPage() {
  return <AuthForm modo="signup" accion={registrarse} />
}
