'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, useTransition } from 'react'
import { CheckCircle2, FileUp, Loader2, TriangleAlert, Upload, X } from 'lucide-react'
import { conciliarConsumos, importarConsumos } from '@/app/dashboard/cards/import/actions'
import {
  resumirConciliacion,
  type ConsumoConciliado,
  type ConsumoImportado,
  type Veredicto,
} from '@/lib/reconciliation-service'
import { formatearFecha, formatearMonto, type CuentaElegible } from '@/lib/types'

/**
 * Cada veredicto tiene su color y no se negocia: verde = entra, gris = ya
 * estaba, naranja = hay que mirarlo. Es lo primero que se lee de la pantalla.
 */
const PESTANAS: {
  id: Veredicto
  etiqueta: string
  activa: string
  inactiva: string
  punto: string
}[] = [
  {
    id: 'nuevo',
    etiqueta: 'Nuevos',
    activa: 'border-success-emerald/50 bg-success-emerald/15 text-success-emerald',
    inactiva: 'border-glass-stroke/40 text-on-surface-variant hover:text-success-emerald',
    punto: 'bg-success-emerald',
  },
  {
    id: 'duplicado',
    etiqueta: 'Registrados',
    activa: 'border-on-surface-variant/40 bg-on-surface-variant/10 text-on-surface-variant',
    inactiva: 'border-glass-stroke/40 text-on-surface-variant/70 hover:text-on-surface-variant',
    punto: 'bg-on-surface-variant/50',
  },
  {
    id: 'diferencia',
    etiqueta: 'Ajustes / Diferencias',
    activa: 'border-budget-warn/50 bg-budget-warn/15 text-budget-warn',
    inactiva: 'border-glass-stroke/40 text-on-surface-variant hover:text-budget-warn',
    punto: 'bg-budget-warn',
  },
]

/** Franja lateral de color de cada fila, según su veredicto. */
const BORDE_DE_FILA: Record<Veredicto, string> = {
  nuevo: 'border-l-2 border-l-success-emerald',
  duplicado: 'border-l-2 border-l-on-surface-variant/30',
  diferencia: 'border-l-2 border-l-budget-warn',
}

type Etapa = 'carga' | 'leyendo' | 'revision'

export function StatementImporter({ tarjetas }: { tarjetas: CuentaElegible[] }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [etapa, setEtapa] = useState<Etapa>('carga')
  const [arrastrando, setArrastrando] = useState(false)
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [conciliado, setConciliado] = useState<ConsumoConciliado[]>([])
  const [pestana, setPestana] = useState<Veredicto>('nuevo')
  const [excluidos, setExcluidos] = useState<Set<number>>(new Set())
  const [tarjetaId, setTarjetaId] = useState(tarjetas[0]?.id ?? '')
  const [importando, iniciarImportacion] = useTransition()

  const conteos = useMemo(() => resumirConciliacion(conciliado), [conciliado])

  const visibles = useMemo(
    () =>
      conciliado
        .map((fila, indice) => ({ fila, indice }))
        .filter(({ fila }) => fila.veredicto === pestana),
    [conciliado, pestana]
  )

  const aImportar = useMemo(
    () =>
      conciliado
        .map((fila, indice) => ({ fila, indice }))
        .filter(({ fila, indice }) => fila.veredicto === 'nuevo' && !excluidos.has(indice))
        .map(({ fila }) => fila.consumo),
    [conciliado, excluidos]
  )

  async function procesar(archivo: File) {
    setError(null)
    setAviso(null)
    setEtapa('leyendo')
    setNombreArchivo(archivo.name)

    try {
      const cuerpo = new FormData()
      cuerpo.append('file', archivo)

      const respuesta = await fetch('/api/cards/parse-statement', {
        method: 'POST',
        body: cuerpo,
      })
      const datos = await respuesta.json()

      if (!respuesta.ok) {
        setError(datos?.error ?? `Error ${respuesta.status}`)
        setEtapa('carga')
        return
      }

      const consumos = (datos.transactions ?? []) as ConsumoImportado[]
      if (consumos.length === 0) {
        setError('No se detectó ningún consumo en el archivo.')
        setEtapa('carga')
        return
      }

      const resultado = await conciliarConsumos(consumos)
      if (!resultado.ok) {
        setError(resultado.error)
        setEtapa('carga')
        return
      }

      setConciliado(resultado.resultado)
      setExcluidos(new Set())
      setPestana('nuevo')
      setEtapa('revision')
    } catch {
      setError('No se pudo procesar el archivo. Probá de nuevo.')
      setEtapa('carga')
    }
  }

  function importar() {
    if (aImportar.length === 0 || !tarjetaId) return

    iniciarImportacion(async () => {
      const resultado = await importarConsumos(aImportar, tarjetaId)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setError(null)
      setAviso(`Se importaron ${resultado.importados} movimientos.`)
      setEtapa('carga')
      setConciliado([])
      setNombreArchivo('')
      router.refresh()
    })
  }

  // --- Carga -------------------------------------------------------------
  if (etapa !== 'revision') {
    return (
      <div className="flex flex-col gap-3">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setArrastrando(true)
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setArrastrando(false)
            const archivo = e.dataTransfer.files?.[0]
            if (archivo) void procesar(archivo)
          }}
          className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center transition ${
            arrastrando
              ? 'glow-gold border-gold-leaf bg-gold-leaf/[0.08]'
              : 'border-glass-stroke/60 bg-gold-leaf/[0.02]'
          }`}
        >
          {etapa === 'leyendo' ? (
            <>
              <Loader2 className="size-7 animate-spin text-gold-leaf" aria-hidden />
              <p className="text-sm font-medium tracking-tight">Leyendo {nombreArchivo}…</p>
              <p className="text-xs text-subtle">
                La IA está extrayendo los consumos. Puede tardar hasta un minuto.
              </p>
            </>
          ) : (
            <>
              <FileUp className="size-7 text-gold-leaf/70" aria-hidden />
              <div>
                <p className="font-display text-sm font-bold tracking-tight text-on-background">
                  Arrastrá el resumen de tu tarjeta
                </p>
                <p className="mt-1 text-xs text-subtle">PDF o foto, hasta 8 MB</p>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="btn-gold flex items-center gap-1.5 rounded-xl px-4 py-2 font-display text-xs font-bold uppercase tracking-wider"
              >
                <Upload className="size-4" aria-hidden />
                Elegir archivo
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const archivo = e.target.files?.[0]
                  if (archivo) void procesar(archivo)
                  e.target.value = ''
                }}
              />
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense">
            {error}
          </p>
        )}
        {aviso && (
          <p role="status" className="rounded-xl border border-income/30 bg-income/10 px-3.5 py-2.5 text-sm text-income">
            {aviso}
          </p>
        )}
      </div>
    )
  }

  // --- Revisión ----------------------------------------------------------
  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card flex items-center gap-3 rounded-2xl p-3.5">
        <CheckCircle2 className="size-5 shrink-0 text-success-emerald" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tracking-tight">{nombreArchivo}</p>
          <p className="text-xs text-subtle">{conciliado.length} consumos detectados</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEtapa('carga')
            setConciliado([])
          }}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-on-surface-variant transition hover:bg-gold-leaf/10 hover:text-gold-leaf"
        >
          Cambiar
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Resultado de la conciliación"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {PESTANAS.map(({ id, etiqueta, activa, inactiva, punto }) => {
          const cantidad =
            id === 'nuevo'
              ? conteos.nuevos
              : id === 'duplicado'
                ? conteos.duplicados
                : conteos.diferencias

          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pestana === id}
              onClick={() => setPestana(id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                pestana === id ? activa : inactiva
              }`}
            >
              <span className={`size-1.5 rounded-full ${punto}`} aria-hidden />
              {etiqueta} ({cantidad})
            </button>
          )
        })}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-glass-stroke/50 px-4 py-10 text-center text-sm text-subtle">
          No hay consumos en esta categoría.
        </p>
      ) : (
        <ul className="divide-y divide-glass-stroke/25 overflow-hidden rounded-2xl border border-glass-stroke/50 bg-charcoal">
          {visibles.map(({ fila, indice }) => {
            const excluido = excluidos.has(indice)

            return (
              <li
                key={indice}
                className={`flex items-center gap-3 px-3.5 py-3 ${BORDE_DE_FILA[fila.veredicto]} ${
                  excluido ? 'opacity-45' : ''
                }`}
              >
                {fila.veredicto === 'nuevo' && (
                  <input
                    type="checkbox"
                    checked={!excluido}
                    onChange={() =>
                      setExcluidos((previo) => {
                        const siguiente = new Set(previo)
                        if (siguiente.has(indice)) siguiente.delete(indice)
                        else siguiente.add(indice)
                        return siguiente
                      })
                    }
                    aria-label={`Importar ${fila.consumo.description}`}
                    className="size-4 shrink-0 accent-[var(--success-emerald)]"
                  />
                )}

                {fila.veredicto === 'diferencia' && (
                  <TriangleAlert className="size-4 shrink-0 text-budget-warn" aria-hidden />
                )}
                {fila.veredicto === 'duplicado' && (
                  <X className="size-4 shrink-0 text-on-surface-variant/50" aria-hidden />
                )}

                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium tracking-tight">
                    {fila.consumo.description}
                  </span>
                  <span className="truncate text-xs text-subtle">
                    {formatearFecha(fila.consumo.date)}
                    {fila.consumo.total_installments &&
                      ` · cuota ${fila.consumo.current_installment}/${fila.consumo.total_installments}`}
                    {fila.veredicto !== 'nuevo' && ` · ${fila.motivo}`}
                  </span>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums tracking-tight">
                    {formatearMonto(fila.consumo.amount, fila.consumo.currency)}
                  </p>
                  {fila.veredicto === 'diferencia' && (
                    <p className="text-[10px] tabular-nums text-budget-warn">
                      {fila.diferencia > 0 ? '+' : ''}
                      {formatearMonto(fila.diferencia, fila.consumo.currency)}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense">
          {error}
        </p>
      )}

      <div className="glass-card flex flex-col gap-3 rounded-2xl p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-on-surface-variant">
          Tarjeta del resumen
          <select
            value={tarjetaId}
            onChange={(e) => setTarjetaId(e.target.value)}
            className="rounded-lg border border-glass-stroke/60 bg-charcoal px-3 py-2 text-sm text-foreground outline-none focus:border-gold-leaf"
          >
            {tarjetas.length === 0 && <option value="">No tenés tarjetas cargadas</option>}
            {tarjetas.map((tarjeta) => (
              <option key={tarjeta.id} value={tarjeta.id}>
                {tarjeta.name} ({tarjeta.currency})
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={importar}
          disabled={importando || aImportar.length === 0 || !tarjetaId}
          className="btn-gold flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-display text-xs font-bold uppercase tracking-wider disabled:opacity-50"
        >
          {importando && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Confirmar e importar {aImportar.length} transacci
          {aImportar.length === 1 ? 'ón' : 'ones'}
        </button>
      </div>
    </div>
  )
}
