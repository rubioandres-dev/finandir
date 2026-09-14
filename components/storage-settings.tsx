'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  Lock,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useTraduccion } from '@/components/currency-provider'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { activarBoveda, volverAEstandar } from '@/lib/almacen/activacion'
import { abrirConContrasena } from '@/lib/almacen/cripto'
import { leerSobre } from '@/lib/almacen/nube'
import { recordarClaves } from '@/lib/almacen/sesion'
import type { Backend } from '@/lib/almacen/acceso'
import { createClient } from '@/lib/supabase/client'

/**
 * DÓNDE SE GUARDAN TUS DATOS
 * =============================================================================
 *
 * La pantalla que enciende y apaga el modo cifrado. Corre entera en el
 * navegador y no puede ser de otra manera: la contraseña deriva la clave, y esa
 * clave es de lo que el modo protege al servidor.
 *
 * LA VUELTA SE OFRECE DESDE EL PRIMER DÍA
 *
 * Un modo del que no se puede salir no es una opción, es una trampa. Se puede
 * volver a Estándar con la misma contraseña, y la pantalla lo dice ANTES de
 * activar, no después.
 *
 * EL CÓDIGO DE RECUPERACIÓN SE MUESTRA UNA VEZ Y BLOQUEA
 *
 * No hay "después lo veo". El paso no se puede cerrar sin marcar que se anotó,
 * porque es literalmente lo único que queda si el usuario olvida su contraseña
 * — ni nosotros podemos abrir sus datos.
 */

type Paso =
  | { fase: 'info' }
  | { fase: 'confirmar'; hacia: Backend }
  | { fase: 'trabajando' }
  | { fase: 'codigo'; codigo: string; movimientos: number }
  | { fase: 'error'; mensaje: string; detalle: string[] }

const CAMPO =
  'rounded-lg border border-glass-stroke/50 bg-charcoal/60 px-4 py-3 text-base outline-none transition placeholder:text-subtle focus:border-gold-leaf focus:ring-2 focus:ring-gold-leaf/25 disabled:opacity-60'

const BOTON =
  'fire-gradient glow-gold flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-midnight-navy transition active:scale-95 disabled:opacity-60'

export function StorageSettings({ backend }: { backend: Backend }) {
  const { t } = useTraduccion()
  const [paso, setPaso] = useState<Paso>({ fase: 'info' })
  const [contrasena, setContrasena] = useState('')
  const [anotado, setAnotado] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const enBoveda = backend === 'NUBE'

  async function ejecutar(hacia: Backend) {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setPaso({ fase: 'error', mensaje: t('guardado.sesionVencida'), detalle: [] })
      return
    }

    setPaso({ fase: 'trabajando' })
    const secreto = contrasena
    // La contraseña se descarta apenas se usa: no tiene por qué seguir viva en
    // el estado de React mientras corre la migración.
    setContrasena('')

    if (hacia === 'NUBE') {
      const r = await activarBoveda(supabase, user.id, secreto)
      if (!r.ok) {
        setPaso({
          fase: 'error',
          mensaje: r.error,
          detalle: r.discrepancias.map(
            (d) => `${d.que}: esperaba ${d.esperado}, dio ${d.obtenido}`
          ),
        })
        return
      }

      // Se recuerda la clave en este dispositivo para no pedirla otra vez
      // inmediatamente despues de activarla.
      await recordarClaves(r.claves)
      setPaso({ fase: 'codigo', codigo: r.codigoDeRecuperacion, movimientos: r.resumen.movimientos })
      return
    }

    // --- La vuelta -----------------------------------------------------------
    try {
      const sobre = await leerSobre(supabase)
      if (!sobre) throw new Error(t('guardado.sinSobre'))

      const claves = await abrirConContrasena(sobre, secreto)
      const r = await volverAEstandar(supabase, user.id, claves)
      if (!r.ok) {
        setPaso({ fase: 'error', mensaje: r.error, detalle: [] })
        return
      }
      window.location.reload()
    } catch (error) {
      setPaso({
        fase: 'error',
        mensaje: error instanceof Error ? error.message : t('guardado.fallaGenerica'),
        detalle: [],
      })
    }
  }

  return (
    <Card id="guardado" className="scroll-mt-24">
      <CardContent className="flex flex-col gap-4">
        <CardLabel>
          {enBoveda ? (
            <Lock className="size-3.5 text-gold-leaf" aria-hidden />
          ) : (
            <ShieldCheck className="size-3.5 text-gold-leaf" aria-hidden />
          )}
          {t('guardado.titulo')}
        </CardLabel>

        {paso.fase === 'info' && (
          <Info
            enBoveda={enBoveda}
            onCambiar={() => setPaso({ fase: 'confirmar', hacia: enBoveda ? 'SUPABASE' : 'NUBE' })}
          />
        )}

        {paso.fase === 'confirmar' && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (contrasena.trim()) void ejecutar(paso.hacia)
            }}
          >
            <Riesgos hacia={paso.hacia} />

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-on-surface-variant">
                {t('guardado.pedirContrasena')}
              </span>
              <input
                type="password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                autoComplete="current-password"
                autoFocus
                className={CAMPO}
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setContrasena('')
                  setPaso({ fase: 'info' })
                }}
                className="cursor-pointer rounded-lg border border-glass-stroke/50 px-4 py-2.5 text-sm text-on-surface-variant transition active:scale-95"
              >
                {t('guardado.cancelar')}
              </button>
              <button type="submit" disabled={!contrasena.trim()} className={BOTON}>
                {paso.hacia === 'NUBE' ? t('guardado.activar') : t('guardado.volver')}
              </button>
            </div>
          </form>
        )}

        {paso.fase === 'trabajando' && (
          <div className="flex flex-col items-center gap-2 py-6" role="status">
            <Loader2 className="size-6 animate-spin text-gold-leaf" aria-hidden />
            <p className="text-xs text-on-surface-variant">{t('guardado.trabajando')}</p>
            {/* Se avisa que puede tardar: mover todos los movimientos de alguien
                con anios de historia no es instantaneo, y un spinner mudo se
                interpreta como que se colgo. */}
            <p className="text-[11px] text-subtle">{t('guardado.trabajandoDemora')}</p>
          </div>
        )}

        {paso.fase === 'codigo' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-on-background">
              {t('guardado.listoTitulo')}
            </p>
            <p className="text-[11px] leading-snug text-on-surface-variant">
              {t('guardado.listoDetalle', { movimientos: String(paso.movimientos) })}
            </p>

            <div className="flex flex-col gap-2 rounded-lg border border-gold-leaf/40 bg-gold-leaf/5 p-3">
              <span className="text-[11px] font-medium text-gold-leaf">
                {t('guardado.codigoTitulo')}
              </span>
              <code className="select-all text-center text-base font-semibold tracking-wider text-on-background">
                {paso.codigo}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(paso.codigo)
                  setCopiado(true)
                }}
                className="flex cursor-pointer items-center justify-center gap-1.5 text-[11px] text-subtle underline underline-offset-2"
              >
                {copiado ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
                {copiado ? t('guardado.copiado') : t('guardado.copiar')}
              </button>
            </div>

            <p className="text-[11px] leading-snug text-expense">
              {t('guardado.codigoAdvertencia')}
            </p>

            <label className="flex items-start gap-2 text-[11px] text-on-surface-variant">
              <input
                type="checkbox"
                checked={anotado}
                onChange={(e) => setAnotado(e.target.checked)}
                className="mt-0.5 accent-gold-leaf"
              />
              {t('guardado.loAnote')}
            </label>

            <button
              type="button"
              disabled={!anotado}
              onClick={() => window.location.reload()}
              className={BOTON}
            >
              {t('guardado.terminar')}
            </button>
          </div>
        )}

        {paso.fase === 'error' && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 rounded-lg border border-expense/30 bg-expense/10 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-expense" aria-hidden />
              <div className="flex min-w-0 flex-col gap-1">
                <p role="alert" className="text-xs leading-snug text-expense">
                  {paso.mensaje}
                </p>
                {paso.detalle.length > 0 && (
                  <ul className="flex flex-col gap-0.5 text-[10px] text-expense/80">
                    {paso.detalle.map((linea) => (
                      <li key={linea}>{linea}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPaso({ fase: 'info' })}
              className="cursor-pointer self-start text-[11px] text-subtle underline underline-offset-2"
            >
              {t('guardado.volverAlInicio')}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Info({ enBoveda, onCambiar }: { enBoveda: boolean; onCambiar: () => void }) {
  const { t } = useTraduccion()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-on-background">
          {enBoveda ? t('guardado.modoBoveda') : t('guardado.modoEstandar')}
        </span>
        <span className="text-[11px] leading-snug text-on-surface-variant">
          {enBoveda ? t('guardado.modoBovedaDetalle') : t('guardado.modoEstandarDetalle')}
        </span>
      </div>

      <button
        type="button"
        onClick={onCambiar}
        className="cursor-pointer self-start rounded-lg border border-glass-stroke/50 px-4 py-2 text-sm text-on-background transition active:scale-95"
      >
        {enBoveda ? t('guardado.pasarAEstandar') : t('guardado.pasarABoveda')}
      </button>
    </div>
  )
}

/**
 * Lo que hay que saber ANTES, no después.
 *
 * Las tres cosas que cambian de verdad y que el usuario no puede deducir solo:
 * que nadie va a poder recuperar sus datos por él, que los gastos compartidos
 * dejan de andar, y que la app tarda un segundo más en abrir.
 */
function Riesgos({ hacia }: { hacia: Backend }) {
  const { t } = useTraduccion()

  if (hacia === 'SUPABASE') {
    return (
      <div className="flex gap-2 rounded-lg border border-gold-leaf/30 bg-gold-leaf/5 p-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-leaf" aria-hidden />
        <p className="text-[11px] leading-snug text-on-surface-variant">
          {t('guardado.riesgoVolver')}
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {[
        { Icono: AlertTriangle, texto: t('guardado.riesgoOlvido') },
        { Icono: Users, texto: t('guardado.riesgoCompartidos') },
        { Icono: Lock, texto: t('guardado.riesgoDemora') },
      ].map(({ Icono, texto }) => (
        <li key={texto} className="flex gap-2">
          <Icono className="mt-0.5 size-3.5 shrink-0 text-gold-leaf" aria-hidden />
          <span className="text-[11px] leading-snug text-on-surface-variant">{texto}</span>
        </li>
      ))}
    </ul>
  )
}
