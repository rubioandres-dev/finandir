'use client'

import { useModoMoneda } from '@/components/currency-provider'
import type { Moneda } from '@/lib/types'

/**
 * Las `<option>` de un select de moneda: las divisas que el usuario eligió.
 *
 * Antes cada formulario tenía cableadas ARS y USD, así que elegir euro en el
 * onboarding no habilitaba cargar una cuenta en euros.
 *
 * `actual` es la moneda que ya tiene la fila que se está editando. Se agrega
 * aunque no esté en la lista: si alguien saca el dólar de sus divisas, sus
 * cuentas en dólares siguen existiendo, y al abrir una para editarla el select
 * tiene que poder mostrar su valor. Sin esto el select caería en la primera
 * opción y guardar le cambiaría la moneda a la fila sin avisar.
 */
export function CurrencyOptions({ actual }: { actual?: Moneda | null }) {
  const { monedasSeleccionadas } = useModoMoneda()

  const opciones =
    actual && !monedasSeleccionadas.includes(actual)
      ? [...monedasSeleccionadas, actual]
      : monedasSeleccionadas

  return (
    <>
      {opciones.map((moneda) => (
        <option key={moneda} value={moneda}>
          {moneda}
        </option>
      ))}
    </>
  )
}
