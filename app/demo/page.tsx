'use client'

import { useState } from 'react'
import type { ParsedTransaction } from '../api/ai-parse/route'

const EJEMPLOS = [
  'Compré pizza por 12000',
  'Cargué 25 lucas de nafta ayer',
  'Cobré el sueldo de 1.850.000',
  'Pagué 34500 de luz el lunes',
]

const ETIQUETA_TIPO: Record<ParsedTransaction['type'], string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
  TRANSFER: 'Transferencia',
}

const formatoMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
})

export default function Home() {
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState<ParsedTransaction | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function analizar(event: React.FormEvent) {
    event.preventDefault()
    if (!texto.trim() || cargando) return

    setCargando(true)
    setError(null)
    setResultado(null)

    try {
      const respuesta = await fetch('/api/ai-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texto }),
      })

      const datos = await respuesta.json()

      if (!respuesta.ok) {
        setError(datos?.error ?? `Error ${respuesta.status}`)
        return
      }

      setResultado(datos as ParsedTransaction)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-12 sm:py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">AUREM</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Escribí un movimiento en lenguaje natural y la IA lo convierte en datos estructurados.
        </p>
      </header>

      <form onSubmit={analizar} className="flex flex-col gap-3">
        <label htmlFor="texto" className="text-sm font-medium">
          ¿Qué movimiento querés registrar?
        </label>

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="texto"
            name="texto"
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Compré pizza por 12000"
            maxLength={500}
            autoComplete="off"
            disabled={cargando}
            className="flex-1 rounded-lg border border-black/15 bg-transparent px-4 py-3 text-base outline-none transition placeholder:text-black/35 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 disabled:opacity-60 dark:border-white/20 dark:placeholder:text-white/35"
          />

          <button
            type="submit"
            disabled={cargando || !texto.trim()}
            className="rounded-lg bg-emerald-600 px-6 py-3 text-base font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {cargando ? 'Analizando…' : 'Analizar'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {EJEMPLOS.map((ejemplo) => (
            <button
              key={ejemplo}
              type="button"
              onClick={() => setTexto(ejemplo)}
              disabled={cargando}
              className="rounded-full border border-black/10 px-3 py-1 text-xs text-black/60 transition hover:border-emerald-500/50 hover:text-emerald-700 disabled:opacity-50 dark:border-white/15 dark:text-white/60 dark:hover:text-emerald-400"
            >
              {ejemplo}
            </button>
          ))}
        </div>
      </form>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {resultado && (
        <section aria-live="polite" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={`text-2xl font-semibold tabular-nums ${
                resultado.type === 'INCOME'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-black dark:text-white'
              }`}
            >
              {resultado.type === 'INCOME' ? '+' : '−'}
              {formatoMoneda.format(resultado.amount)}
            </span>
            <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-medium dark:bg-white/10">
              {ETIQUETA_TIPO[resultado.type]}
            </span>
            <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-medium dark:bg-white/10">
              {resultado.category_suggested}
            </span>
            <span className="text-xs text-black/50 dark:text-white/50">{resultado.date}</span>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-black/45 dark:text-white/45">
              Respuesta del endpoint
            </h2>
            <pre className="overflow-x-auto rounded-lg border border-black/10 bg-black/[0.03] p-4 font-mono text-sm leading-relaxed dark:border-white/10 dark:bg-white/[0.04]">
              {JSON.stringify(resultado, null, 2)}
            </pre>
          </div>
        </section>
      )}
    </main>
  )
}
