'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { Loader2, Plus, QrCode, Users } from 'lucide-react'
import { crearEspacio, unirseAEspacio } from '@/app/dashboard/shared-expenses/actions'
import { useModoMoneda, useTraduccion } from '@/components/currency-provider'
import { QrScannerModal } from '@/components/qr-invite'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import type { Espacio, TipoDeEspacio } from '@/lib/shared-expenses-service'

const CAMPO =
  'rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-3 py-2 text-sm outline-none transition focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60'

const TIPOS: { codigo: TipoDeEspacio; emoji: string; etiqueta: string }[] = [
  { codigo: 'CONVIVENCIA', emoji: '🏠', etiqueta: 'Convivencia' },
  { codigo: 'VIAJE', emoji: '✈️', etiqueta: 'Viaje' },
  { codigo: 'EVENTO', emoji: '🎉', etiqueta: 'Evento' },
]

/** UUID en cualquier parte del texto: el QR trae una URL, no el id pelado. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export function SharedSpacesList({ espacios }: { espacios: Espacio[] }) {
  const router = useRouter()
  const { t } = useTraduccion()
  const { modo } = useModoMoneda()

  const [creando, setCreando] = useState(false)
  const [escaneando, setEscaneando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoDeEspacio>('EVENTO')
  const [error, setError] = useState<string | null>(null)
  const [enVuelo, iniciar] = useTransition()

  function crear() {
    if (!nombre.trim()) return
    setError(null)

    iniciar(async () => {
      // `crearEspacio` redirige al grupo nuevo cuando sale bien, así que sólo
      // se llega acá si falló.
      const resultado = await crearEspacio({ nombre: nombre.trim(), tipo, moneda: modo })
      if (!resultado.ok) setError(resultado.error)
    })
  }

  const alEscanear = useCallback(
    (texto: string) => {
      setEscaneando(false)
      const encontrado = texto.match(UUID)

      if (!encontrado) {
        setError('Ese código no es una invitación de AUREM.')
        return
      }

      iniciar(async () => {
        const resultado = await unirseAEspacio(encontrado[0])
        if (!resultado.ok) {
          setError(resultado.error)
          return
        }
        router.push(`/dashboard/shared-expenses/${encontrado[0]}`)
      })
    },
    [router]
  )

  return (
    <div className="flex flex-col gap-4">
      {/* --- Acciones ------------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setCreando((previo) => !previo)}
          disabled={enVuelo}
          className="btn-gold-subtle cursor-pointer justify-center rounded-xl px-3 py-2.5 text-xs font-semibold"
        >
          <Plus className="size-4" aria-hidden />
          {t('compartidos.nuevoGrupo')}
        </button>

        <button
          type="button"
          onClick={() => setEscaneando(true)}
          disabled={enVuelo}
          className="btn-gold-subtle cursor-pointer justify-center rounded-xl px-3 py-2.5 text-xs font-semibold"
        >
          <QrCode className="size-4" aria-hidden />
          {t('compartidos.escanear')}
        </button>
      </div>

      {creando && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <CardLabel>{t('compartidos.nuevoGrupo')}</CardLabel>

            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={80}
              autoFocus
              placeholder="Vacaciones Bariloche"
              disabled={enVuelo}
              className={CAMPO}
            />

            <div role="group" className="flex gap-1 rounded-lg border border-glass-stroke/40 p-0.5">
              {TIPOS.map(({ codigo, emoji, etiqueta }) => (
                <button
                  key={codigo}
                  type="button"
                  onClick={() => setTipo(codigo)}
                  aria-pressed={tipo === codigo}
                  disabled={enVuelo}
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                    tipo === codigo
                      ? 'bg-gold-leaf/10 text-gold-leaf'
                      : 'text-on-surface-variant hover:text-gold-leaf'
                  }`}
                >
                  <span aria-hidden>{emoji}</span>
                  {etiqueta}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-subtle">{t('comun.enMoneda', { moneda: modo })}</p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={crear}
                disabled={enVuelo || !nombre.trim()}
                className="fire-gradient glow-gold flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60"
              >
                {enVuelo && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {t('comun.guardar')}
              </button>
              <button
                type="button"
                onClick={() => setCreando(false)}
                disabled={enVuelo}
                className="cursor-pointer rounded-lg border border-glass-stroke/50 px-3 py-2.5 text-sm font-medium text-on-surface-variant transition hover:border-gold-leaf/60 disabled:opacity-60"
              >
                {t('comun.cancelar')}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-expense/30 bg-expense/10 px-3.5 py-2.5 text-sm text-expense"
        >
          {error}
        </p>
      )}

      {/* --- Grupos -------------------------------------------------------- */}
      {espacios.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-glass-stroke/60 px-4 py-10 text-center text-sm text-subtle">
          {t('compartidos.sinGrupos')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {espacios.map((espacio) => {
            const tipoInfo = TIPOS.find((x) => x.codigo === espacio.type)

            return (
              <li key={espacio.id}>
                <Link
                  href={`/dashboard/shared-expenses/${espacio.id}`}
                  className="glass-card flex items-center gap-3 rounded-2xl p-4 transition hover:border-gold-leaf/60"
                >
                  <span className="text-xl leading-none" aria-hidden>
                    {tipoInfo?.emoji ?? '🎉'}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold tracking-tight text-on-background">
                      {espacio.name}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-subtle">
                      <Users className="size-3" aria-hidden />
                      {t('compartidos.miembros', { cantidad: espacio.miembros })} · {espacio.currency}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {escaneando && (
        <QrScannerModal onDetectado={alEscanear} onCerrar={() => setEscaneando(false)} />
      )}
    </div>
  )
}
