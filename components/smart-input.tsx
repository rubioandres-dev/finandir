'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { Loader2, Mic, Sparkles, Square } from 'lucide-react'
import { guardarTransaccion } from '@/app/dashboard/actions'
import { VoiceMeter } from '@/components/voice-meter'
import { useVoiceInput } from '@/lib/use-voice-input'
import {
  ETIQUETA_TIPO,
  formatearMonto,
  hoyEnArgentina,
  type MovimientoSugerido,
  type TipoTransaccion,
} from '@/lib/types'

const EJEMPLOS = ['Gasté 1500 en la carnicería hoy', 'Cargué 25 lucas de nafta', 'Cobré el sueldo']

type Props = {
  /** Nombres de categorías del usuario, para poblar el select de la vista previa. */
  categorias: { nombre: string; tipo: 'INCOME' | 'EXPENSE' }[]
}

export function SmartInput({ categorias }: Props) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [analizando, setAnalizando] = useState(false)
  const [guardando, iniciarGuardado] = useTransition()
  const [borrador, setBorrador] = useState<MovimientoSugerido | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /**
   * Espejo de `texto` para leerlo sin depender del closure: el dictado y el
   * análisis automático ocurren en callbacks asíncronos del reconocedor.
   */
  const textoRef = useRef('')
  /** Evita dos análisis simultáneos (botón + auto-disparo por voz). */
  const enVueloRef = useRef(false)
  const [analizadoPorVoz, setAnalizadoPorVoz] = useState(false)

  function escribir(valor: string) {
    textoRef.current = valor
    setTexto(valor)
  }

  async function analizarTexto(valor: string, desdeVoz = false) {
    const limpio = valor.trim()
    if (!limpio || enVueloRef.current) return

    enVueloRef.current = true
    setAnalizando(true)
    setAnalizadoPorVoz(desdeVoz)
    setError(null)
    setExito(null)
    setBorrador(null)

    try {
      const respuesta = await fetch('/api/ai-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: limpio }),
      })
      const datos = await respuesta.json()

      if (!respuesta.ok) {
        setError(datos?.error ?? `Error ${respuesta.status}`)
        return
      }

      setBorrador(datos as MovimientoSugerido)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      enVueloRef.current = false
      setAnalizando(false)
    }
  }

  const voz = useVoiceInput({
    onResultadoFinal: (transcripcion) => {
      // Se agrega a lo que ya haya escrito, en vez de pisarlo.
      const previo = textoRef.current.trim()
      escribir(previo ? `${previo} ${transcripcion}` : transcripcion)
      setError(null)
    },
    // El motor cerró la frase al detectar la pausa: analizamos solos.
    onDictadoFinalizado: () => {
      void analizarTexto(textoRef.current, true)
    },
  })

  function analizar(event: React.FormEvent) {
    event.preventDefault()
    void analizarTexto(texto)
  }

  function confirmar() {
    if (!borrador || guardando) return

    iniciarGuardado(async () => {
      const resultado = await guardarTransaccion({
        amount: borrador.amount,
        type: borrador.type,
        currency: borrador.currency,
        category_suggested: borrador.category_suggested,
        description: borrador.description,
        date: borrador.date,
      })

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      setBorrador(null)
      escribir('')
      setError(null)
      setExito('Movimiento guardado.')
      // Vuelve a ejecutar el Server Component del dashboard con los datos nuevos.
      router.refresh()
    })
  }

  // Para el select: las del tipo elegido, más la sugerida si la IA inventó una.
  const categoriasDisponibles = borrador
    ? Array.from(
        new Set([
          ...categorias.filter((c) => c.tipo === borrador.type).map((c) => c.nombre),
          ...(borrador.type !== 'TRANSFER' ? [borrador.category_suggested] : []),
        ])
      ).sort((a, b) => a.localeCompare(b, 'es'))
    : []

  function actualizar<K extends keyof MovimientoSugerido>(campo: K, valor: MovimientoSugerido[K]) {
    setBorrador((previo) => (previo ? { ...previo, [campo]: valor } : previo))
  }

  return (
    <section className="flex flex-col gap-3">
      <form onSubmit={analizar} className="flex flex-col gap-2.5">
        <div className="relative">
          <Sparkles
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={voz.escuchando && voz.parcial ? `${texto} ${voz.parcial}`.trim() : texto}
            onChange={(e) => escribir(e.target.value)}
            placeholder={voz.escuchando ? 'Te escucho…' : 'Gasté $1500 en la carnicería hoy'}
            maxLength={500}
            autoComplete="off"
            enterKeyHint="send"
            disabled={analizando || guardando}
            aria-label="Describí el movimiento en lenguaje natural"
            className={`w-full rounded-xl border bg-white py-3.5 pl-10 text-base outline-none transition placeholder:text-black/35 focus:ring-2 disabled:opacity-60 dark:bg-white/[0.04] dark:placeholder:text-white/30 ${
              voz.soportado ? 'pr-12' : 'pr-3.5'
            } ${
              voz.escuchando
                ? 'border-red-500 ring-2 ring-red-500/25'
                : 'border-black/12 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-white/15'
            }`}
          />

          {voz.soportado && (
            <button
              type="button"
              onClick={voz.alternar}
              disabled={analizando || guardando}
              aria-label={
                voz.escuchando
                  ? 'Detener dictado sin analizar'
                  : 'Dictar por voz: al hacer una pausa se analiza solo'
              }
              title={
                voz.escuchando
                  ? 'Detener sin analizar'
                  : 'Dictar por voz — al pausar se analiza automáticamente'
              }
              aria-pressed={voz.escuchando}
              className={`absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg transition disabled:opacity-40 ${
                voz.escuchando
                  ? 'bg-red-500 text-white'
                  : 'text-black/40 hover:bg-black/5 hover:text-black/70 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/75'
              }`}
            >
              {voz.escuchando ? (
                <>
                  {/* Halo pulsante detrás del botón mientras graba. */}
                  <span className="absolute inset-0 animate-ping rounded-lg bg-red-500/40" aria-hidden />
                  <Square className="relative size-3.5 fill-current" aria-hidden />
                </>
              ) : (
                <Mic className="size-[18px]" aria-hidden />
              )}
            </button>
          )}
        </div>

        {voz.soportado && (
          <VoiceMeter
            estado={voz.estado}
            nivel={voz.nivel}
            sinSenal={voz.sinSenal}
            permiso={voz.permiso}
          />
        )}

        {voz.error && (
          <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
            {voz.error}
          </p>
        )}

        <button
          type="submit"
          disabled={analizando || guardando || !texto.trim()}
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-base font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {analizando && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {analizando ? 'Interpretando…' : 'Analizar con IA'}
        </button>
      </form>

      {!borrador && !analizando && (
        <div className="flex flex-wrap gap-1.5">
          {EJEMPLOS.map((ejemplo) => (
            <button
              key={ejemplo}
              type="button"
              onClick={() => escribir(ejemplo)}
              className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55 transition hover:border-emerald-500/50 hover:text-emerald-700 dark:border-white/12 dark:text-white/55 dark:hover:text-emerald-400"
            >
              {ejemplo}
            </button>
          ))}
        </div>
      )}

      {analizando && (
        <div
          role="status"
          className="flex animate-pulse items-center gap-2 rounded-xl border border-black/8 bg-black/[0.02] px-4 py-3 text-sm text-black/50 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/50"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {analizadoPorVoz
            ? 'Terminaste de hablar: interpretando lo que dictaste…'
            : 'Gemini está interpretando tu movimiento…'}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {exito && !borrador && (
        <p
          role="status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-sm text-emerald-700 dark:text-emerald-300"
        >
          {exito}
        </p>
      )}

      {borrador && (
        <div className="flex flex-col gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">Revisá antes de guardar</h2>
            <span
              className={`text-lg font-semibold tabular-nums ${
                borrador.type === 'INCOME'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-black dark:text-white'
              }`}
            >
              {borrador.type === 'INCOME' ? '+' : '−'}
              {formatearMonto(borrador.amount || 0, borrador.currency)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-black/60 dark:text-white/60">
              Importe
              <div className="flex overflow-hidden rounded-lg border border-black/12 bg-white focus-within:border-emerald-500 dark:border-white/15 dark:bg-white/[0.06]">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={borrador.amount}
                  onChange={(e) => actualizar('amount', Number(e.target.value))}
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-black outline-none dark:text-white"
                />
                {/* La moneda va pegada al importe: es una propiedad del monto,
                    no un campo aparte. */}
                <select
                  value={borrador.currency}
                  onChange={(e) => actualizar('currency', e.target.value as 'ARS' | 'USD')}
                  aria-label="Moneda del movimiento"
                  className="border-l border-black/10 bg-black/[0.03] px-2 text-xs font-medium tabular-nums text-black outline-none dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                >
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-black/60 dark:text-white/60">
              Tipo
              <select
                value={borrador.type}
                onChange={(e) => actualizar('type', e.target.value as TipoTransaccion)}
                className="rounded-lg border border-black/12 bg-white px-3 py-2 text-sm text-black outline-none focus:border-emerald-500 dark:border-white/15 dark:bg-white/[0.06] dark:text-white"
              >
                {(Object.keys(ETIQUETA_TIPO) as TipoTransaccion[]).map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ETIQUETA_TIPO[tipo]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-black/60 dark:text-white/60">
              Categoría
              <select
                value={borrador.category_suggested}
                disabled={borrador.type === 'TRANSFER'}
                onChange={(e) => actualizar('category_suggested', e.target.value)}
                className="rounded-lg border border-black/12 bg-white px-3 py-2 text-sm text-black outline-none focus:border-emerald-500 disabled:opacity-45 dark:border-white/15 dark:bg-white/[0.06] dark:text-white"
              >
                {borrador.type === 'TRANSFER' ? (
                  <option value="">Sin categoría</option>
                ) : (
                  categoriasDisponibles.map((nombre) => (
                    <option key={nombre} value={nombre}>
                      {nombre}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-black/60 dark:text-white/60">
              Fecha
              <input
                type="date"
                value={borrador.date}
                max={hoyEnArgentina()}
                onChange={(e) => actualizar('date', e.target.value)}
                className="rounded-lg border border-black/12 bg-white px-3 py-2 text-sm text-black outline-none focus:border-emerald-500 dark:border-white/15 dark:bg-white/[0.06] dark:text-white"
              />
            </label>

            <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-black/60 dark:text-white/60">
              Descripción
              <input
                type="text"
                value={borrador.description}
                maxLength={120}
                onChange={(e) => actualizar('description', e.target.value)}
                className="rounded-lg border border-black/12 bg-white px-3 py-2 text-sm text-black outline-none focus:border-emerald-500 dark:border-white/15 dark:bg-white/[0.06] dark:text-white"
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmar}
              disabled={guardando || !borrador.amount || !borrador.description.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {guardando ? 'Guardando…' : 'Confirmar y guardar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setBorrador(null)
                setError(null)
              }}
              disabled={guardando}
              className="rounded-lg border border-black/12 px-4 py-2.5 text-sm font-medium text-black/65 transition hover:border-black/25 disabled:opacity-45 dark:border-white/15 dark:text-white/65"
            >
              Descartar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
