import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Une clases de Tailwind resolviendo conflictos: la última gana.
 * Sin esto, pasar `className="p-6"` a un componente que ya trae `p-4` deja
 * ambas y el resultado depende del orden en el CSS generado.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
