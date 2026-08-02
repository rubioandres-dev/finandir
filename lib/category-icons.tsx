import { createElement } from 'react'
import {
  Bus,
  Circle,
  CircleDollarSign,
  GraduationCap,
  HeartPulse,
  Gamepad2,
  Plug,
  ShoppingBag,
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

/**
 * `categories.icon` guarda el nombre del ícono como texto (así lo siembra
 * schema.sql). Este mapa lo traduce a un componente de lucide.
 */
const ICONOS: Record<string, LucideIcon> = {
  utensils: Utensils,
  bus: Bus,
  plug: Plug,
  'gamepad-2': Gamepad2,
  'graduation-cap': GraduationCap,
  'heart-pulse': HeartPulse,
  wallet: Wallet,
  'shopping-bag': ShoppingBag,
  'circle-dollar-sign': CircleDollarSign,
  circle: Circle,
}

export function iconoDeCategoria(nombre: string | null | undefined): LucideIcon {
  return (nombre && ICONOS[nombre]) || Circle
}

/**
 * Renderiza el ícono de una categoría a partir de su nombre.
 *
 * Usa `createElement` en lugar de JSX a propósito: elegir el componente en el
 * cuerpo del render y escribir `<Icono />` dispara la regla
 * `react-hooks/static-components`, que no puede saber que la referencia sale
 * de un mapa estático y es estable.
 */
export function IconoCategoria({
  icono,
  className,
}: {
  icono: string | null | undefined
  className?: string
}) {
  return createElement(iconoDeCategoria(icono), { className, 'aria-hidden': true })
}
