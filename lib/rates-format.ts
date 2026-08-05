/**
 * Formato de las cotizaciones de referencia.
 *
 * Vive aparte de `lib/rates.ts` porque eso es código de servidor (habla con
 * Supabase y con dolarapi) y esto lo necesitan la card y el modal, que son
 * componentes de cliente. Compartirlo es lo que garantiza que la vista previa
 * del dashboard y el panel completo muestren el mismo número igual escrito.
 */

export const formatoPesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

/** "2026-08-05T14:32:00Z" -> "5/8 14:32". Vacío si la API no la informó. */
export function formatearActualizacion(iso: string | null): string | null {
  if (!iso) return null
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return null

  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(fecha)
}

/**
 * Precio de compra listo para mostrar, o `null` si no hay dato.
 *
 * Algunas cotizaciones (Tarjeta, a veces CCL) informan `compra: 0`, que no es
 * un precio: es "no aplica". Mostrar $0 sería inventar un dato.
 */
export function formatearCompra(compra: number | null): string | null {
  if (compra === null || compra <= 0) return null
  return formatoPesos.format(compra)
}
