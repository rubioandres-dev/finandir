'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { guardarCuenta, type CuentaAGuardar } from '@/app/dashboard/accounts/actions'
import { CurrencyOptions } from '@/components/currency-options'
import { useTraduccion } from '@/components/currency-provider'
import {
  type Cuenta,
  type DetalleTarjeta,
  type Moneda,
  type TipoDeCuenta,
} from '@/lib/types'

const TIPOS: TipoDeCuenta[] = ['BANK', 'WALLET', 'CASH', 'INVESTMENT', 'CREDIT_CARD']
const DIAS = Array.from({ length: 31 }, (_, i) => i + 1)

const ETIQUETA_CAMPO = 'flex flex-col gap-1 text-xs font-medium text-muted'
const CAMPO =
  'rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary'

type Props = {
  /** Presente = modo edición: el formulario arranca abierto y precargado. */
  cuenta?: Cuenta
  /** Datos de tarjeta de `cuenta`, si los tiene. */
  detalle?: DetalleTarjeta
  /** Solo en modo edición: cerrar sin guardar. */
  onCerrar?: () => void
}

/** "-1234.5" -> -1234.5; vacío o basura -> null. */
function aNumero(valor: string): number | null {
  const limpio = valor.trim().replace(',', '.')
  if (limpio === '') return null
  const numero = Number(limpio)
  return Number.isFinite(numero) ? numero : null
}

export function AccountForm({ cuenta, detalle, onCerrar }: Props) {
  const { t } = useTraduccion()
  const router = useRouter()
  const editando = cuenta != null

  const [abierto, setAbierto] = useState(editando)
  const [guardando, iniciarGuardado] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [tipo, setTipo] = useState<TipoDeCuenta>(cuenta?.type ?? 'BANK')
  const [nombre, setNombre] = useState(cuenta?.name ?? '')
  const [moneda, setMoneda] = useState<Moneda>(
    cuenta?.currency.trim() === 'USD' ? 'USD' : 'ARS'
  )
  const [cierre, setCierre] = useState(detalle?.closing_day ?? 20)
  const [vencimiento, setVencimiento] = useState(detalle?.due_day ?? 10)
  const [limite, setLimite] = useState(
    detalle?.credit_limit != null ? String(detalle.credit_limit) : ''
  )
  const [banco, setBanco] = useState(detalle?.bank_name ?? '')
  const [ultimos, setUltimos] = useState(detalle?.last_four_digits ?? '')

  const esTarjeta = tipo === 'CREDIT_CARD'

  // En una tarjeta el saldo se guarda negativo (es deuda), pero se edita en
  // positivo: nadie piensa su deuda en negativo.
  const saldoOriginal = Number(cuenta?.balance ?? 0)
  const [saldo, setSaldo] = useState(
    cuenta ? String(cuenta.type === 'CREDIT_CARD' ? Math.abs(saldoOriginal) : saldoOriginal) : ''
  )

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()

    const saldoIngresado = aNumero(saldo)
    if (saldo.trim() !== '' && saldoIngresado === null) {
      setError(t('cuentas.errorSaldo'))
      return
    }

    // Negativo = deuda cuando es tarjeta.
    const saldoAGuardar =
      saldoIngresado === null
        ? null
        : esTarjeta
          ? -Math.abs(saldoIngresado)
          : saldoIngresado

    const entrada: CuentaAGuardar = {
      ...(cuenta ? { id: cuenta.id } : {}),
      name: nombre,
      type: tipo,
      currency: moneda,
      // Al editar solo se manda si cambió, para no pisar lo que hicieron los
      // triggers de movimientos entre que se abrió el formulario y se guardó.
      ...(saldoAGuardar !== null && (!editando || saldoAGuardar !== saldoOriginal)
        ? { balance: saldoAGuardar }
        : {}),
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

      if (editando) {
        onCerrar?.()
      } else {
        setNombre('')
        setSaldo('')
        setLimite('')
        setBanco('')
        setUltimos('')
        setAbierto(false)
      }
      router.refresh()
    })
  }

  function cerrar() {
    setError(null)
    if (editando) onCerrar?.()
    else setAbierto(false)
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-3 text-sm font-medium text-muted transition hover:border-primary/50 hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden />
        {t('cuentas.agregar')}
      </button>
    )
  }

  return (
    <form
      onSubmit={enviar}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="aurem-caps text-[11px] text-gold-leaf">
          {editando ? t('cuentas.editar') : t('cuentas.nueva')}
        </h3>
        <button
          type="button"
          onClick={cerrar}
          aria-label={t('comun.cerrar')}
          className="grid size-7 place-items-center rounded-md text-subtle hover:bg-foreground/5"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={`col-span-2 ${ETIQUETA_CAMPO}`}>
          {t('comun.nombre')}
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            maxLength={80}
            placeholder={
              esTarjeta ? t('cuentas.placeholderTarjeta') : t('cuentas.placeholderCuenta')
            }
            className={CAMPO}
          />
        </label>

        <label className={ETIQUETA_CAMPO}>
          {t('objetivos.tipoCampo')}
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDeCuenta)}
            className={CAMPO}
          >
            {TIPOS.map((opcion) => (
              <option key={opcion} value={opcion}>
                {t(`tipoCuenta.${opcion}`)}
              </option>
            ))}
          </select>
        </label>

        <label className={ETIQUETA_CAMPO}>
          {t('comun.moneda')}
          <select
            value={moneda}
            onChange={(e) => setMoneda(e.target.value as Moneda)}
            className={CAMPO}
          >
            <CurrencyOptions actual={moneda} />
          </select>
        </label>

        <label className={`col-span-2 ${ETIQUETA_CAMPO}`}>
          {esTarjeta
            ? t('cuentas.deudaActual')
            : editando
              ? t('cuentas.saldoActual')
              : t('cuentas.saldoInicial')}
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            {...(esTarjeta ? { min: '0' } : {})}
            value={saldo}
            onChange={(e) => setSaldo(e.target.value)}
            placeholder="0"
            className={`${CAMPO} tabular-nums`}
          />
          <span className="text-[10px] font-normal leading-snug text-subtle">
            {esTarjeta ? t('cuentas.ayudaDeuda') : t('cuentas.ayudaSaldo')}
          </span>
        </label>

        {esTarjeta && (
          <>
            <label className={ETIQUETA_CAMPO}>
              {t('cuentas.diaCierre')}
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
              {t('cuentas.diaVencimiento')}
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
              {t('cuentas.limite')}
              <input
                type="number"
                min="0"
                step="1000"
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
                placeholder={t('cuentas.sinLimite')}
                className={`${CAMPO} tabular-nums`}
              />
            </label>

            <label className={ETIQUETA_CAMPO}>
              {t('cuentas.ultimosDigitos')}
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
              {t('cuentas.banco')}
              <input
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
                maxLength={60}
                placeholder={t('cuentas.placeholderBanco')}
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
        {editando ? t('mov.guardarCambios') : t('comun.guardar')}
      </button>
    </form>
  )
}
