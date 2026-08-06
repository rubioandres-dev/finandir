'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Percent, Wallet, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { guardarObjetivo } from '@/app/dashboard/goals/actions'
import { useFormatoRegional, useTraduccion } from '@/components/currency-provider'
import { TIPOS_DE_OBJETIVO, type TipoDeObjetivo } from '@/lib/goals-service'
import type { Moneda } from '@/lib/types'

const CAMPO =
  'rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-3 py-2 text-sm outline-none transition focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60'

/** Contexto real del usuario, para poder mostrar la contraparte del número. */
export type ContextoDeMetas = {
  ingresosDelMes: number
  gastosDelMes: number
  deuda: number
  moneda: Moneda
}

/**
 * Alta y edición de un objetivo, con carga dual.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * "Ahorrar el 20%" y "ahorrar $300.000" son la misma meta dicha de dos formas,
 * y cada persona piensa en una. Obligar a una sola obliga a hacer la cuenta a
 * mano —y a rehacerla cada vez que cambia el sueldo—. Acá se puede escribir
 * cualquiera de las dos y la otra se calcula en vivo.
 *
 * LO QUE SE GUARDA SIGUE SIENDO UNO SOLO
 *
 * En la base, cada tipo tiene su unidad canónica: porcentaje en las tasas,
 * meses en el fondo de emergencia, dinero en la deuda. El toggle es
 * de ENTRADA, no de almacenamiento. Guardar las dos cosas dejaría dos números
 * que se desincronizan en cuanto cambian los ingresos.
 */
export function GoalModal({
  contexto,
  tipoInicial = 'SAVINGS_RATE',
  onCerrar,
}: {
  contexto: ContextoDeMetas
  tipoInicial?: TipoDeObjetivo
  onCerrar: () => void
}) {
  const router = useRouter()
  const { t } = useTraduccion()
  const { formatearMonto } = useFormatoRegional()

  const [tipo, setTipo] = useState<TipoDeObjetivo>(tipoInicial)
  const [modo, setModo] = useState<'monto' | 'porcentaje'>('porcentaje')
  const [valor, setValor] = useState('20')
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()

  const numero = Number(valor.replace(',', '.'))
  const valido = Number.isFinite(numero) && numero > 0

  /**
   * El fondo de emergencia se carga SIEMPRE en dinero.
   *
   * Un porcentaje de los ingresos no dice nada acá: lo que importa es cuántos
   * meses de tu vida cubre esa plata, y eso se mide contra el gasto, no contra
   * lo que entra. El subtexto hace esa cuenta.
   */
  const soloMonto = tipo === 'EMERGENCY_FUND'
  const modoEfectivo = soloMonto ? 'monto' : modo

  /** Base contra la que se convierte % ↔ $, según el tipo. */
  const base = tipo === 'DEBT_REDUCTION' ? contexto.deuda : contexto.ingresosDelMes

  /**
   * Lo que se guarda, en la unidad canónica del tipo.
   *
   * Tasas: porcentaje. Presupuesto y deuda: dinero. Fondo: meses de gasto.
   */
  function valorCanonico(): number | null {
    if (!valido) return null

    if (tipo === 'SAVINGS_RATE' || tipo === 'INVESTMENT_RATE') {
      if (modoEfectivo === 'porcentaje') return numero
      if (base <= 0) return null
      return Math.round((numero / base) * 10000) / 100
    }

    if (tipo === 'EMERGENCY_FUND') {
      // Se ingresa en dinero y se guarda en meses: es la unidad que la
      // medición sabe comparar.
      if (contexto.gastosDelMes <= 0) return null
      return Math.round((numero / contexto.gastosDelMes) * 100) / 100
    }

    // DEBT_REDUCTION guarda dinero.
    if (modoEfectivo === 'monto') return numero
    if (base <= 0) return null
    return Math.round(base * (numero / 100) * 100) / 100
  }

  /** La contraparte, en vivo, en la unidad que el usuario NO está escribiendo. */
  function contraparte(): string | null {
    if (!valido) return null

    if (tipo === 'EMERGENCY_FUND') {
      if (contexto.gastosDelMes <= 0) return t('objetivos.sinGasto')
      const meses = Math.round((numero / contexto.gastosDelMes) * 10) / 10
      return t('objetivos.gastoPromedio', {
        monto: formatearMonto(contexto.gastosDelMes, contexto.moneda),
        meses,
      })
    }

    if (tipo === 'DEBT_REDUCTION') {
      if (base <= 0) return t('objetivos.sinDeuda')
      if (modoEfectivo === 'monto') {
        const porcentaje = Math.round((numero / base) * 1000) / 10
        return `${t('objetivos.deudaActual', { monto: formatearMonto(base, contexto.moneda) })} ${t(
          'objetivos.equivalePorcentaje',
          { porcentaje }
        )}`
      }
      const monto = base * (1 - numero / 100)
      return t('objetivos.equivaleDeuda', { monto: formatearMonto(monto, contexto.moneda) })
    }

    // Tasas: la contraparte se calcula contra los ingresos.
    if (base <= 0) return t('objetivos.sinIngresos')

    if (modoEfectivo === 'porcentaje') {
      return t('objetivos.equivale', {
        monto: formatearMonto(base * (numero / 100), contexto.moneda),
      })
    }

    const porcentaje = Math.round((numero / base) * 1000) / 10
    return t('objetivos.equivalePorcentaje', { porcentaje })
  }

  function guardar() {
    const canonico = valorCanonico()

    if (canonico === null || canonico <= 0) {
      setError(
        base <= 0 && modoEfectivo === 'monto'
          ? t('objetivos.sinIngresos')
          : 'La meta tiene que ser un número mayor a cero.'
      )
      return
    }

    setError(null)
    iniciar(async () => {
      const resultado = await guardarObjetivo({
        tipo,
        valor: canonico,
        moneda: contexto.moneda,
      })

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      onCerrar()
      router.refresh()
    })
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="objetivo-titulo"
      className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label={t('comun.cerrar')}
        onClick={onCerrar}
        className="absolute inset-0 bg-midnight-navy/70 backdrop-blur-sm"
      />

      <div className="glass-card relative z-10 flex max-h-[92dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-menu px-5 pt-5 respiro-hoja sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3">
          <h3 id="objetivo-titulo" className="aurem-caps text-[11px] text-gold-leaf">
            {t('objetivos.nuevo')}
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={t('comun.cerrar')}
            className="grid size-7 cursor-pointer place-items-center rounded-md text-subtle transition hover:bg-foreground/5"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t('objetivos.tipoCampo')}
          <select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as TipoDeObjetivo)
              setError(null)
            }}
            disabled={guardando}
            className={CAMPO}
          >
            {TIPOS_DE_OBJETIVO.map((codigo) => (
              <option key={codigo} value={codigo}>
                {t(`objetivos.tipo.${codigo}` as const)}
              </option>
            ))}
          </select>
        </label>

        <p className="text-[11px] leading-snug text-subtle">
          {t(`objetivos.ayuda.${tipo}` as const)}
        </p>

        {/* El selector de categoría se fue con la 013: ningún tipo vigente usa
            categoría. Los techos de gasto se editan en su propia sección. */}

        {/* --- Toggle $ / % ------------------------------------------------ */}
        {!soloMonto && (
          <div
            role="group"
            aria-label={t('objetivos.meta')}
            className="flex gap-1 rounded-lg border border-glass-stroke/40 p-0.5"
          >
            {(['monto', 'porcentaje'] as const).map((opcion) => (
              <button
                key={opcion}
                type="button"
                onClick={() => setModo(opcion)}
                aria-pressed={modoEfectivo === opcion}
                disabled={guardando}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  modoEfectivo === opcion
                    ? 'bg-gold-leaf/10 text-gold-leaf'
                    : 'text-on-surface-variant hover:text-gold-leaf'
                }`}
              >
                {opcion === 'monto' ? (
                  <Wallet className="size-3.5" aria-hidden />
                ) : (
                  <Percent className="size-3.5" aria-hidden />
                )}
                {opcion === 'monto' ? t('objetivos.porMonto') : t('objetivos.porPorcentaje')}
              </button>
            ))}
          </div>
        )}

        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t('objetivos.meta')}
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step={modoEfectivo === 'monto' ? '1000' : '1'}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              autoFocus
              disabled={guardando}
              className={`${CAMPO} flex-1 tabular-nums`}
            />
            <span className="shrink-0 text-sm text-subtle">
              {modoEfectivo === 'monto' ? contexto.moneda : '%'}
            </span>
          </div>
        </label>

        {/* La contraparte en vivo: es lo que vuelve entendible el número. */}
        {contraparte() && (
          <p className="rounded-lg border border-glass-stroke/40 bg-charcoal/40 px-3 py-2 text-[11px] leading-snug text-on-surface-variant">
            {contraparte()}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
          >
            {error}
          </p>
        )}

        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !valido}
            className="fire-gradient glow-gold flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60"
          >
            {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t('objetivos.guardar')}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="cursor-pointer rounded-lg border border-glass-stroke/50 px-3 py-2.5 text-sm font-medium text-on-surface-variant transition hover:border-gold-leaf/60 disabled:opacity-60"
          >
            {t('comun.cancelar')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
