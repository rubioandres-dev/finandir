import { createElement } from 'react'
import {
  Baby,
  Bus,
  Car,
  Circle,
  CircleDollarSign,
  Coffee,
  Dumbbell,
  Gift,
  GraduationCap,
  HeartPulse,
  Gamepad2,
  Home,
  Landmark,
  Laptop,
  PawPrint,
  Phone,
  PiggyBank,
  Plane,
  Plug,
  Receipt,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Utensils,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

/**
 * `categories.icon` guarda el nombre del ícono como texto (así lo siembra
 * schema.sql). Este mapa lo traduce a un componente de lucide.
 *
 * Los diez primeros son los que ya usaba el seed; el resto se agregó para el
 * selector de categorías personalizadas. Agregar uno acá es lo único que hace
 * falta para que aparezca en el selector: `ICONOS_ELEGIBLES` sale de este mapa.
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
  'shopping-cart': ShoppingCart,
  home: Home,
  car: Car,
  plane: Plane,
  coffee: Coffee,
  shirt: Shirt,
  dumbbell: Dumbbell,
  'paw-print': PawPrint,
  baby: Baby,
  gift: Gift,
  laptop: Laptop,
  phone: Phone,
  receipt: Receipt,
  scissors: Scissors,
  wrench: Wrench,
  landmark: Landmark,
  'piggy-bank': PiggyBank,
}

/** Los nombres que ofrece el selector de íconos, en el orden del mapa. */
export const ICONOS_ELEGIBLES = Object.keys(ICONOS)

/**
 * Paleta AUREM para categorías.
 *
 * Son colores que se leen sobre el navy del tema oscuro Y sobre el marfil del
 * claro. No incluye el dorado de la marca a propósito: ese acento identifica a
 * la app, y una categoría pintada igual que el logo compite con él.
 */
export const PALETA_CATEGORIAS = [
  '#F97316',
  '#EF4444',
  '#EC4899',
  '#8B5CF6',
  '#6366F1',
  '#3B82F6',
  '#0EA5E9',
  '#14B8A6',
  '#22C55E',
  '#84CC16',
  '#EAB308',
  '#64748B',
]

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
