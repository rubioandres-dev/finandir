'use client'

import { DebtManager } from '@/components/debt-manager'
import { Card, CardLabel } from '@/components/ui/card'
import { useFormatoRegional, useModoMoneda, useTraduccion } from '@/components/currency-provider'
import { esDeLaMoneda } from '@/lib/currency-mode'
import type { Patrimonio } from '@/lib/accounts-service'
import type { Deuda, Moneda } from '@/lib/types'

/**
 * LA VISTA DE DEUDAS, SIN SABER DE DÓNDE SALEN LOS DATOS
 * =============================================================================
 *
 * Es la primera pantalla partida en dos, y el patrón que van a seguir las demás:
 *
 *     vista        recibe datos y dibuja. No sabe leer nada.
 *     page.tsx     los lee en el SERVIDOR y se los pasa.  (modo Estándar)
 *     *-en-cliente los lee en el NAVEGADOR y se los pasa. (modo Bóveda)
 *
 * Partirla es lo que evita escribir la pantalla dos veces. Y no es gratis por
 * casualidad: las services ya reciben un `Libro`, así que los dos cargadores
 * llaman exactamente la misma función con un libro distinto.
 *
 * EL FORMATO Y EL IDIOMA SALEN DE HOOKS, NO DE PROPS
 *
 * Antes la página los calculaba en el servidor y los bajaba por props. Desde
 * acá salen del provider de monedas, que ya existía y ya los tenía: así los dos
 * cargadores no tienen que acordarse de pasarlos, que es la clase de cosa que
 * se olvida en la séptima pantalla.
 */
export function VistaDeudas({
  deudas,
  patrimonio,
  error,
}: {
  deudas: Deuda[]
  patrimonio: Patrimonio
  error: string | null
}) {
  const { t } = useTraduccion()
  const { formatearMonto } = useFormatoRegional()
  const { modo } = useModoMoneda()

  // Solo el libro activo, igual que en cuentas y movimientos.
  const visibles = deudas.filter((d) => esDeLaMoneda(d, modo))
  const soloModo = (totales: { moneda: Moneda; valor: number }[]) =>
    totales.filter((total) => total.moneda === modo)

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-lg font-bold tracking-tight text-on-background">
        {t('deudas.titulo')}
      </h1>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-expense/30 bg-expense/10 px-4 py-3 text-sm text-expense"
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <CardLabel>{t('deudas.meDeben')}</CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {soloModo(patrimonio.porCobrar).map((total) => (
              <span
                key={total.moneda}
                className="text-base font-semibold tabular-nums text-income"
              >
                {formatearMonto(total.valor, total.moneda)}
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <CardLabel>{t('deudas.debo')}</CardLabel>
          <div className="mt-2 flex flex-col gap-0.5">
            {soloModo(patrimonio.deudaPersonal).map((total) => (
              <span
                key={total.moneda}
                className="text-base font-semibold tabular-nums text-expense"
              >
                {formatearMonto(total.valor, total.moneda)}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <DebtManager deudas={visibles} />
    </div>
  )
}
