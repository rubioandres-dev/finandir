'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Check, Loader2, Lock, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  actualizarCategoria,
  borrarCategoria,
  crearCategoria,
} from '@/app/dashboard/categories/actions'
import {
  ICONOS_ELEGIBLES,
  IconoCategoria,
  PALETA_CATEGORIAS,
} from '@/lib/category-icons'
import type { Categoria } from '@/lib/types'

const CAMPO =
  'rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-3 py-2 text-sm outline-none transition placeholder:text-subtle focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60'

/** Una categoría con la marca de la 008. Puede faltar si no está corrida. */
type CategoriaConOrigen = Categoria & { is_custom?: boolean | null }

type Formulario = {
  id: string | null
  nombre: string
  tipo: 'INCOME' | 'EXPENSE'
  icono: string
  color: string
}

const FORMULARIO_VACIO: Formulario = {
  id: null,
  nombre: '',
  tipo: 'EXPENSE',
  icono: 'circle',
  color: PALETA_CATEGORIAS[0],
}

/**
 * Disparador del modal.
 *
 * Existe para que la página de movimientos —que es un Server Component— pueda
 * ofrecer el administrador sin volverse cliente entera.
 */
export function CategoriesManagerButton({ categorias }: { categorias: CategoriaConOrigen[] }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="shrink-0 cursor-pointer text-xs font-medium text-gold-leaf transition hover:underline"
      >
        Categorías
      </button>

      {abierto && (
        <CategoriesManagerModal categorias={categorias} onCerrar={() => setAbierto(false)} />
      )}
    </>
  )
}

/**
 * Alta, edición y borrado de categorías.
 *
 * SISTEMA VS PERSONALIZADAS
 *
 * Las que vinieron con la app (`is_custom = false`) se listan pero no se
 * editan ni se borran: son las que usa el parser de IA como referencia y las
 * que el seed vuelve a crear en cada alta de usuario, así que borrarlas daría
 * la ilusión de un cambio que se revierte solo.
 *
 * Si la 008 no está corrida, `is_custom` llega `undefined` y todo se muestra
 * como personalizada. Es la degradación correcta: sin la marca no se puede
 * distinguir, y bloquear todo por las dudas dejaría al usuario sin poder
 * tocar ni las suyas.
 */
export function CategoriesManagerModal({
  categorias,
  onCerrar,
}: {
  categorias: CategoriaConOrigen[]
  onCerrar: () => void
}) {
  const router = useRouter()
  const [formulario, setFormulario] = useState<Formulario | null>(null)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()

  useEffect(() => {
    function alEscapar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alEscapar)
    return () => document.removeEventListener('keydown', alEscapar)
  }, [onCerrar])

  const delSistema = categorias.filter((c) => c.is_custom === false)
  const propias = categorias.filter((c) => c.is_custom !== false)

  function guardar() {
    if (!formulario) return
    setError(null)

    iniciar(async () => {
      const entrada = {
        nombre: formulario.nombre.trim(),
        tipo: formulario.tipo,
        icono: formulario.icono,
        color: formulario.color,
      }

      const resultado = formulario.id
        ? await actualizarCategoria(formulario.id, entrada)
        : await crearCategoria(entrada)

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      setFormulario(null)
      router.refresh()
    })
  }

  function borrar(id: string) {
    setError(null)
    iniciar(async () => {
      const resultado = await borrarCategoria(id)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setConfirmandoBorrado(null)
      router.refresh()
    })
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="categorias-titulo"
      className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-midnight-navy/70 backdrop-blur-sm"
      />

      <div className="glass-card safe-bottom relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-3xl bg-menu p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3">
          <h3 id="categorias-titulo" className="aurem-caps text-[11px] text-gold-leaf">
            Categorías
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid size-7 cursor-pointer place-items-center rounded-md text-subtle transition hover:bg-foreground/5"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
          >
            {error}
          </p>
        )}

        {/* --- Formulario de alta / edición --------------------------------- */}
        {formulario ? (
          <div className="flex flex-col gap-3 rounded-xl border border-glass-stroke/50 p-3.5">
            <p className="aurem-caps text-[10px] text-gold-leaf/70">
              {formulario.id ? 'Editar categoría' : 'Nueva categoría'}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted">
                Nombre
                <input
                  type="text"
                  value={formulario.nombre}
                  onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
                  maxLength={60}
                  autoFocus
                  placeholder="Mascotas"
                  disabled={guardando}
                  className={CAMPO}
                />
              </label>

              <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-muted">
                Tipo
                <div role="group" className="flex gap-1 rounded-lg border border-glass-stroke/40 p-0.5">
                  {(['EXPENSE', 'INCOME'] as const).map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setFormulario({ ...formulario, tipo })}
                      aria-pressed={formulario.tipo === tipo}
                      disabled={guardando}
                      className={`flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium transition ${
                        formulario.tipo === tipo
                          ? 'bg-gold-leaf/10 text-gold-leaf'
                          : 'text-on-surface-variant hover:text-gold-leaf'
                      }`}
                    >
                      {tipo === 'EXPENSE' ? 'Gasto' : 'Ingreso'}
                    </button>
                  ))}
                </div>
              </label>
            </div>

            {/* --- Paleta --------------------------------------------------- */}
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted">Color</p>
              <ul className="flex flex-wrap gap-1.5">
                {PALETA_CATEGORIAS.map((color) => (
                  <li key={color}>
                    <button
                      type="button"
                      onClick={() => setFormulario({ ...formulario, color })}
                      aria-label={`Color ${color}`}
                      aria-pressed={formulario.color === color}
                      disabled={guardando}
                      style={{ backgroundColor: color }}
                      className={`grid size-7 cursor-pointer place-items-center rounded-full transition active:scale-90 ${
                        formulario.color === color
                          ? 'ring-2 ring-gold-leaf ring-offset-2 ring-offset-menu'
                          : ''
                      }`}
                    >
                      {formulario.color === color && (
                        <Check className="size-3.5 text-midnight-navy" aria-hidden />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* --- Íconos --------------------------------------------------- */}
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted">Ícono</p>
              <ul className="grid max-h-32 grid-cols-7 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-9">
                {ICONOS_ELEGIBLES.map((icono) => (
                  <li key={icono}>
                    <button
                      type="button"
                      onClick={() => setFormulario({ ...formulario, icono })}
                      aria-label={`Ícono ${icono}`}
                      aria-pressed={formulario.icono === icono}
                      disabled={guardando}
                      className={`grid aspect-square w-full cursor-pointer place-items-center rounded-lg border transition active:scale-90 ${
                        formulario.icono === icono
                          ? 'border-gold-leaf bg-gold-leaf/10 text-gold-leaf'
                          : 'border-glass-stroke/40 text-on-surface-variant hover:border-gold-leaf/60'
                      }`}
                    >
                      <IconoCategoria icono={icono} className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={guardar}
                disabled={guardando || !formulario.nombre.trim()}
                className="fire-gradient glow-gold flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60"
              >
                {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={() => setFormulario(null)}
                disabled={guardando}
                className="cursor-pointer rounded-lg border border-glass-stroke/50 px-3 py-2.5 text-sm font-medium text-on-surface-variant transition active:scale-95 hover:border-gold-leaf/60 disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFormulario(FORMULARIO_VACIO)}
            className="btn-gold-subtle cursor-pointer justify-center rounded-xl px-3 py-2.5 text-xs font-semibold"
          >
            <Plus className="size-4" aria-hidden />
            Nueva categoría
          </button>
        )}

        {/* --- Propias ------------------------------------------------------ */}
        <section className="flex flex-col gap-1.5">
          <p className="aurem-caps text-[10px] text-on-surface-variant/70">
            Personalizadas ({propias.length})
          </p>

          {propias.length === 0 ? (
            <p className="rounded-xl border border-dashed border-glass-stroke/50 px-3 py-4 text-center text-[11px] text-subtle">
              Todavía no creaste ninguna.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-glass-stroke/25">
              {propias.map((categoria) => (
                <li key={categoria.id} className="flex items-center gap-2.5 py-2">
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-lg"
                    style={{ backgroundColor: `${categoria.color}22`, color: categoria.color }}
                  >
                    <IconoCategoria icono={categoria.icon} className="size-3.5" />
                  </span>

                  <span className="min-w-0 flex-1 truncate text-sm">{categoria.name}</span>

                  <span className="shrink-0 text-[10px] text-subtle">
                    {categoria.type === 'EXPENSE' ? 'Gasto' : 'Ingreso'}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setFormulario({
                        id: categoria.id,
                        nombre: categoria.name,
                        tipo: categoria.type,
                        icono: categoria.icon,
                        color: categoria.color,
                      })
                    }
                    aria-label={`Editar ${categoria.name}`}
                    disabled={guardando}
                    className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-subtle transition hover:bg-foreground/5 hover:text-gold-leaf"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </button>

                  {confirmandoBorrado === categoria.id ? (
                    <button
                      type="button"
                      onClick={() => borrar(categoria.id)}
                      disabled={guardando}
                      className="shrink-0 cursor-pointer rounded-md bg-expense/15 px-2 py-1 text-[10px] font-semibold text-expense transition active:scale-95"
                    >
                      {guardando ? '…' : 'Confirmar'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmandoBorrado(categoria.id)}
                      aria-label={`Borrar ${categoria.name}`}
                      disabled={guardando}
                      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-subtle transition hover:bg-expense/10 hover:text-expense"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {confirmandoBorrado && (
            <p className="text-[11px] leading-snug text-subtle">
              Los movimientos que la usaban no se borran: quedan sin categoría.
            </p>
          )}
        </section>

        {/* --- Del sistema --------------------------------------------------- */}
        {delSistema.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <p className="aurem-caps flex items-center gap-1.5 text-[10px] text-on-surface-variant/70">
              <Lock className="size-3" aria-hidden />
              Del sistema ({delSistema.length})
            </p>

            <ul className="flex flex-wrap gap-1.5">
              {delSistema.map((categoria) => (
                <li
                  key={categoria.id}
                  className="flex items-center gap-1.5 rounded-lg border border-glass-stroke/40 px-2 py-1.5"
                  title="Viene con la app: no se puede editar ni borrar"
                >
                  <span style={{ color: categoria.color }}>
                    <IconoCategoria icono={categoria.icon} className="size-3.5" />
                  </span>
                  <span className="text-[11px] text-on-surface-variant">{categoria.name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>,
    document.body
  )
}
