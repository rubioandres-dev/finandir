'use client'

import { useCallback, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useModoMoneda } from '@/components/currency-provider'
import { FloatingPanel } from '@/components/layout/floating-panel'
import { nombreDeMoneda } from '@/lib/monedas'
import type { Moneda } from '@/lib/types'

/**
 * Selector de la moneda activa del header.
 *
 * TRES FORMAS SEGÚN CUÁNTAS DIVISAS ELIGIÓ EL USUARIO
 *
 *   1 divisa  → insignia estática. No hay nada que elegir, y un toggle de una
 *               sola posición invita a tocarlo para nada.
 *   2 divisas → el toggle de siempre, que muestra las dos y el estado de un
 *               vistazo. Es el caso más común y no se paga con un click.
 *   N divisas → desplegable. Con cuatro o cinco códigos el toggle no entra en
 *               el header en mobile.
 *
 * No cambia equivalencias: CAMBIA LA MONEDA DE LA APP. Con ARS elegido, las
 * vistas de gestión muestran solo cuentas, movimientos, tarjetas y
 * presupuestos en pesos. Los libros nunca se suman entre sí: para verlos
 * juntos está la vista consolidada.
 */
export function CurrencySelector({ cotizacion }: { cotizacion: number | null }) {
  const { modo, cambiarModo, cambiando, monedasSeleccionadas } = useModoMoneda()

  const mep = cotizacion?.toLocaleString('es-AR', { maximumFractionDigits: 0 })
  const titulo = cotizacion ? `Moneda activa de la app · MEP ${mep}` : 'Moneda activa de la app'
  const etiqueta = cotizacion ? `Moneda activa · dólar MEP ${mep}` : 'Moneda activa'

  if (monedasSeleccionadas.length === 1) {
    return <InsigniaUnica moneda={modo} titulo={titulo} />
  }

  if (monedasSeleccionadas.length === 2) {
    return (
      <Toggle
        monedas={monedasSeleccionadas}
        modo={modo}
        cambiarModo={cambiarModo}
        cambiando={cambiando}
        titulo={titulo}
        etiqueta={etiqueta}
      />
    )
  }

  return (
    <Desplegable
      monedas={monedasSeleccionadas}
      modo={modo}
      cambiarModo={cambiarModo}
      cambiando={cambiando}
      titulo={titulo}
    />
  )
}

/** Caso 1: no hay nada que elegir, solo que recordar en qué moneda se está. */
function InsigniaUnica({ moneda, titulo }: { moneda: Moneda; titulo: string }) {
  return (
    <span
      title={titulo}
      aria-label={`Moneda de la app: ${nombreDeMoneda(moneda)}`}
      className="shrink-0 rounded-xl border border-glass-stroke/60 bg-gold-leaf/10 px-2.5 py-1.5 font-display text-[10px] font-bold uppercase tracking-widest text-gold-leaf"
    >
      {moneda}
    </span>
  )
}

/** Caso 2: el toggle de dos posiciones de siempre. */
function Toggle({
  monedas,
  modo,
  cambiarModo,
  cambiando,
  titulo,
  etiqueta,
}: {
  monedas: Moneda[]
  modo: Moneda
  cambiarModo: (m: Moneda) => void
  cambiando: boolean
  titulo: string
  etiqueta: string
}) {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      title={titulo}
      // `aria-busy` mientras el servidor recarga: el cambio no es instantáneo
      // porque cada vista vuelve a consultar filtrada por la moneda nueva.
      aria-busy={cambiando}
      className={`flex shrink-0 rounded-xl border border-glass-stroke/60 bg-surface-container/60 p-0.5 transition-opacity ${
        cambiando ? 'opacity-60' : ''
      }`}
    >
      {monedas.map((opcion) => {
        const activa = modo === opcion

        return (
          <button
            key={opcion}
            type="button"
            onClick={() => cambiarModo(opcion)}
            aria-pressed={activa}
            className={`cursor-pointer rounded-lg px-2 py-1 font-display text-[10px] font-bold uppercase tracking-widest transition active:scale-90 ${
              activa
                ? 'fire-gradient text-midnight-navy'
                : 'text-on-surface-variant hover:text-gold-leaf'
            }`}
          >
            {opcion}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Caso N: desplegable sobrio.
 *
 * Va sobre `FloatingPanel` y no sobre un `absolute` propio porque el header
 * tiene `backdrop-blur`, que recorta a sus descendientes posicionados en
 * WebKit. Está documentado en `components/layout/floating-panel.tsx`.
 */
function Desplegable({
  monedas,
  modo,
  cambiarModo,
  cambiando,
  titulo,
}: {
  monedas: Moneda[]
  modo: Moneda
  cambiarModo: (m: Moneda) => void
  cambiando: boolean
  titulo: string
}) {
  const [abierto, setAbierto] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const cerrar = useCallback(() => setAbierto(false), [])

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((previo) => !previo)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-busy={cambiando}
        title={titulo}
        aria-label={`Moneda activa: ${nombreDeMoneda(modo)}. Cambiar`}
        className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-xl border border-glass-stroke/60 bg-surface-container/60 py-1.5 pl-2.5 pr-1.5 font-display text-[10px] font-bold uppercase tracking-widest text-gold-leaf transition active:scale-95 hover:border-gold-leaf/60 ${
          cambiando ? 'opacity-60' : ''
        }`}
      >
        {modo}
        <ChevronDown
          className={`size-3.5 transition-transform ${abierto ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {abierto && (
        <FloatingPanel ancla={boton} onCerrar={cerrar} ancho="w-52" rol="menu" etiqueta="Moneda activa">
          <p className="aurem-caps px-2.5 py-2 text-[10px] text-gold-leaf/70">Moneda de la app</p>

          <ul className="flex flex-col">
            {monedas.map((opcion) => {
              const activa = opcion === modo

              return (
                <li key={opcion}>
                  <button
                    type="button"
                    onClick={() => {
                      cambiarModo(opcion)
                      cerrar()
                    }}
                    aria-current={activa ? 'true' : undefined}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-gold-leaf/[0.07] ${
                      activa ? 'text-gold-leaf' : 'text-on-surface-variant'
                    }`}
                  >
                    <span className="font-display text-[11px] font-bold uppercase tracking-widest">
                      {opcion}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px]">
                      {nombreDeMoneda(opcion)}
                    </span>
                    {activa && <Check className="size-3.5 shrink-0" aria-hidden />}
                  </button>
                </li>
              )
            })}
          </ul>
        </FloatingPanel>
      )}
    </>
  )
}
