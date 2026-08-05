'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Coins, Globe, Loader2, Sparkles } from 'lucide-react'
import { completarOnboarding } from '@/app/dashboard/settings/actions'
import { CurrencyPicker } from '@/components/currency-picker'
import { RegionPicker } from '@/components/region-picker'
import { LOCALE_POR_DEFECTO, type Locale } from '@/lib/formatters'
import { MONEDAS_POR_DEFECTO } from '@/lib/monedas'
import type { Moneda } from '@/lib/types'

const CAMPO =
  'rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-4 py-3 text-base outline-none transition placeholder:text-subtle focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60'

/**
 * Onboarding de tres pasos: nombre, divisas y región.
 *
 * NO SE PUEDE CERRAR SIN COMPLETARLO, y es a propósito: sin divisas elegidas
 * la app no sabe qué filtrar, y el default silencioso (ARS + USD) es
 * justamente lo que este flujo viene a reemplazar por una decisión explícita.
 * Por eso no hay botón de cerrar, ni telón que cierre al tocar, ni Escape.
 *
 * Va porteado a `document.body` por lo mismo que el resto de los modales de la
 * app: cualquier ancestro con `backdrop-filter` —y el header tiene uno—
 * recorta a sus descendientes `fixed` en WebKit. Está documentado en
 * `components/layout/floating-panel.tsx`.
 *
 * Solo lo monta el layout cuando el perfil dice `onboarding_completed: false`
 * Y la migración 007 está aplicada: un modal obligatorio que no puede guardar
 * dejaría la app inusable.
 */
export function OnboardingModal({
  nombreInicial,
  monedasIniciales = MONEDAS_POR_DEFECTO,
  localeInicial = LOCALE_POR_DEFECTO,
}: {
  nombreInicial?: string | null
  monedasIniciales?: Moneda[]
  localeInicial?: Locale
}) {
  const router = useRouter()
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [nombre, setNombre] = useState(nombreInicial ?? '')
  const [monedas, setMonedas] = useState<Moneda[]>([...monedasIniciales])
  const [locale, setLocale] = useState<Locale>(localeInicial)
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()

  const nombreValido = nombre.trim().length > 0

  function guardar() {
    setError(null)
    iniciar(async () => {
      const resultado = await completarOnboarding({ nombre: nombre.trim(), monedas, locale })

      if (resultado.error) {
        setError(resultado.error)
        return
      }

      // El layout vuelve a leer el perfil y deja de montar el modal.
      router.refresh()
    })
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-titulo"
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center"
    >
      <div className="absolute inset-0 bg-midnight-navy/85 backdrop-blur-sm" aria-hidden />

      <div className="glass-card relative z-10 flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-3xl bg-menu px-6 pt-6 respiro-hoja sm:rounded-3xl">
        {/* --- Cabecera y progreso ---------------------------------------- */}
        <div className="flex flex-col gap-2">
          <span className="fire-gradient glow-gold grid size-9 place-items-center rounded-xl font-display text-sm font-extrabold text-midnight-navy">
            A
          </span>

          <h2
            id="onboarding-titulo"
            className="font-display text-xl font-bold tracking-tight text-on-background"
          >
            {paso === 1 ? 'Bienvenido a Aurem' : paso === 2 ? 'Tus divisas' : 'Tu región'}
          </h2>

          <div className="flex items-center gap-1.5" aria-hidden>
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  n <= paso ? 'bg-gold-leaf' : 'bg-gold-leaf/15'
                }`}
              />
            ))}
          </div>
          <p className="aurem-caps text-[9px] text-on-surface-variant/70">Paso {paso} de 3</p>
        </div>

        {/* --- Paso 1: nombre ---------------------------------------------- */}
        {paso === 1 ? (
          <div className="flex flex-col gap-3">
            <label htmlFor="onboarding-nombre" className="text-sm font-medium">
              Nombre con el que querés aparecer
            </label>
            <input
              id="onboarding-nombre"
              type="text"
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter' && nombreValido) setPaso(2)
              }}
              maxLength={80}
              autoComplete="name"
              autoFocus
              placeholder="Andrés"
              disabled={guardando}
              className={CAMPO}
            />
            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-subtle">
              <Sparkles className="mt-0.5 size-3 shrink-0 text-gold-leaf" aria-hidden />
              Es lo que vas a ver en el menú de perfil y en las iniciales del avatar. Podés
              cambiarlo cuando quieras desde Ajustes.
            </p>
          </div>
        ) : paso === 2 ? (
          /* --- Paso 2: divisas ------------------------------------------- */
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Seleccioná las divisas con las que trabajás</p>
              <p className="flex items-start gap-1.5 text-[11px] leading-snug text-subtle">
                <Coins className="mt-0.5 size-3 shrink-0 text-gold-leaf" aria-hidden />
                Cada divisa es un libro aparte: nunca se suman entre sí, salvo en la vista
                consolidada. Elegí solo las que usás de verdad.
              </p>
            </div>

            <CurrencyPicker
              seleccionadas={monedas}
              onCambiar={setMonedas}
              deshabilitado={guardando}
            />
          </div>
        ) : (
          /* --- Paso 3: región -------------------------------------------- */
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">¿Dónde estás?</p>
              <p className="flex items-start gap-1.5 text-[11px] leading-snug text-subtle">
                <Globe className="mt-0.5 size-3 shrink-0 text-gold-leaf" aria-hidden />
                Define cómo se escriben los importes y las fechas. No es un detalle: 10/09 es el
                10 de septiembre en unos países y el 9 de octubre en otros.
              </p>
            </div>

            <RegionPicker
              seleccionada={locale}
              onCambiar={setLocale}
              deshabilitado={guardando}
            />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
          >
            {error}
          </p>
        )}

        {/* --- Botonera ---------------------------------------------------- */}
        <div className="mt-1 flex items-center gap-2">
          {paso > 1 && (
            <button
              type="button"
              onClick={() => setPaso((previo) => (previo === 3 ? 2 : 1))}
              disabled={guardando}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-glass-stroke/50 px-3 py-2.5 text-sm font-medium text-on-surface-variant transition active:scale-95 hover:border-gold-leaf/60 hover:text-gold-leaf disabled:opacity-60"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Atrás
            </button>
          )}

          <button
            type="button"
            onClick={() => (paso === 3 ? guardar() : setPaso(paso === 1 ? 2 : 3))}
            disabled={guardando || (paso === 1 && !nombreValido)}
            className="fire-gradient glow-gold flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60"
          >
            {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {paso < 3 ? (
              <>
                Seguir
                <ArrowRight className="size-4" aria-hidden />
              </>
            ) : guardando ? (
              'Guardando…'
            ) : (
              'Guardar y comenzar'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
