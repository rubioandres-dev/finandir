'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { guardarCuenta, type CuentaAGuardar } from '@/app/dashboard/accounts/actions'
import { ETIQUETA_TIPO_CUENTA, type Moneda, type TipoDeCuenta } from '@/lib/types'

const TIPOS: TipoDeCuenta[] = ['BANK', 'WALLET', 'CASH', 'INVESTMENT', 'CREDIT_CARD']
const DIAS = Array.from({ length: 31 }, (_, i) => i + 1)

const ETIQUETA_CAMPO = 'flex flex-col gap-1 text-xs font-medium text-muted'
const CAMPO =
  'rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary'

export function AccountForm() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [guardando, iniciarGuardado] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [tipo, setTipo] = useState<TipoDeCuenta>('BANK')
  const [nombre, setNombre] = useState('')
  const [moneda, setMoneda] = useState<Moneda>('ARS')
  const [cierre, setCierre] = useState(20)
  const [vencimiento, setVencimiento] = useState(10)
  const [limite, setLimite] = useState('')
  const [banco, setBanco] = useState('')
  const [ultimos, setUltimos] = useState('')

  const esTarjeta = tipo === 'CREDIT_CARD'

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()

    const entrada: CuentaAGuardar = {
      name: nombre,
      type: tipo,
      currency: moneda,
      ...(esTarjeta
        ? {
            closing_day: cierre,
            due_day: vencimiento,
            credit_limit: limite.trim() === '' ? null : Number(limite),
            bank_name: banco.trim() || null,
            last_four_digits: ultimos.trim() || null,
          }
        : {}),
    }

    iniciarGuardado(async () => {
      const resultado = await guardarCuenta(entrada)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      setError(null)
      setNombre('')
      setLimite('')
      setBanco('')
      setUltimos('')
      setAbierto(false)
      router.refresh()
    })
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-3 text-sm font-medium text-muted transition hover:border-primary/50 hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden />
        Agregar cuenta o tarjeta
      </button>
    )
  }

  return (
    <form
      onSubmit={enviar}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="aurem-caps text-[11px] text-gold-leaf">Nueva cuenta</h3>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          aria-label="Cerrar"
          className="grid size-7 place-items-center rounded-md text-subtle hover:bg-foreground/5"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={`col-span-2 ${ETIQUETA_CAMPO}`}>
          Nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            maxLength={80}
            placeholder={esTarjeta ? 'Visa Galicia' : 'Cuenta sueldo'}
            className={CAMPO}
          />
        </label>

        <label className={ETIQUETA_CAMPO}>
          Tipo
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDeCuenta)}
            className={CAMPO}
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_CUENTA[t]}
              </option>
            ))}
          </select>
        </label>

        <label className={ETIQUETA_CAMPO}>
          Moneda
          <select
            value={moneda}
            onChange={(e) => setMoneda(e.target.value as Moneda)}
            className={CAMPO}
          >
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </label>

        {esTarjeta && (
          <>
            <label className={ETIQUETA_CAMPO}>
              Día de cierre
              <select
                value={cierre}
                onChange={(e) => setCierre(Number(e.target.value))}
                className={CAMPO}
              >
                {DIAS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className={ETIQUETA_CAMPO}>
              Día de vencimiento
              <select
                value={vencimiento}
                onChange={(e) => setVencimiento(Number(e.target.value))}
                className={CAMPO}
              >
                {DIAS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className={ETIQUETA_CAMPO}>
              Límite (opcional)
              <input
                type="number"
                min="0"
                step="1000"
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
                placeholder="Sin límite"
                className={`${CAMPO} tabular-nums`}
              />
            </label>

            <label className={ETIQUETA_CAMPO}>
              Últimos 4 dígitos
              <input
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={ultimos}
                onChange={(e) => setUltimos(e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
                className={`${CAMPO} tabular-nums`}
              />
            </label>

            <label className={`col-span-2 ${ETIQUETA_CAMPO}`}>
              Banco (opcional)
              <input
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
                maxLength={60}
                placeholder="Galicia"
                className={CAMPO}
              />
            </label>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-expense">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={guardando || !nombre.trim()}
        className="btn-gold flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider disabled:opacity-50"
      >
        {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Guardar
      </button>
    </form>
  )
}
