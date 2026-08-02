/**
 * Aritmética de planes de cuotas.
 *
 * Vive fuera de actions.ts porque en un archivo 'use server' todo lo exportado
 * tiene que ser una función async, y además así se puede verificar sin
 * levantar el servidor.
 */

/**
 * Reparte un total en N cuotas iguales dejando el redondeo en la última, para
 * que la suma dé exactamente el total (y no 999,99 por arrastre de centavos).
 */
export function repartirEnCuotas(total: number, cuotas: number): number[] {
  if (cuotas <= 1) return [Math.round(total * 100) / 100]

  const base = Math.floor((total / cuotas) * 100) / 100
  const montos = Array.from({ length: cuotas - 1 }, () => base)
  const ultima = Math.round((total - base * (cuotas - 1)) * 100) / 100
  return [...montos, ultima]
}

/**
 * Suma meses a una fecha YYYY-MM-DD recortando al último día real del mes:
 * el 31 de enero + 1 mes es el 28 de febrero, no el 3 de marzo.
 */
export function sumarMeses(fecha: string, meses: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const destino = new Date(Date.UTC(anio, mes - 1 + meses, 1))
  const ultimoDia = new Date(
    Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)
  ).getUTCDate()

  const anioFinal = destino.getUTCFullYear()
  const mesFinal = String(destino.getUTCMonth() + 1).padStart(2, '0')
  const diaFinal = String(Math.min(dia, ultimoDia)).padStart(2, '0')
  return `${anioFinal}-${mesFinal}-${diaFinal}`
}
