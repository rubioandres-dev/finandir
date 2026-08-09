'use client'

import { useState } from 'react'
import {
  CloudUpload,
  Download,
  KeyRound,
  Loader2,
  Server,
  ShieldCheck,
  Smartphone,
  Timer,
  TriangleAlert,
} from 'lucide-react'
import { Card, CardContent, CardLabel } from '@/components/ui/card'
import { ITERACIONES_PBKDF2, decryptData, encryptData, generarSal, generateUserKey } from '@/lib/crypto'
import {
  ALCANCE_DRIVE,
  armarRespaldo,
  exportLocalBackup,
  simulateDriveSync,
  type RespaldoCifrado,
  type ResultadoDeSync,
} from '@/lib/drive-poc'
import { hoyEnArgentina } from '@/lib/types'

/**
 * Laboratorio del modo local-first con cifrado en el cliente.
 *
 * No toca Supabase ni guarda nada: todo lo que pasa acá vive en el estado de
 * React y se pierde al recargar. Es un banco de pruebas para contestar tres
 * preguntas antes de comprometerse con la arquitectura —¿el dato sale
 * ilegible?, ¿cuánto cuesta en milisegundos?, ¿el respaldo se puede recuperar
 * sin el servidor?— y no un adelanto de la función.
 */

const CAMPO =
  'rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary'
const ETIQUETA_CAMPO = 'flex flex-col gap-1 text-xs font-medium text-muted'
const BOTON_SECUNDARIO =
  'flex items-center justify-center gap-2 rounded-xl border border-glass-stroke/60 px-3 py-2.5 text-xs font-medium text-on-surface-variant transition hover:border-gold-leaf/60 hover:text-gold-leaf disabled:opacity-40'

const CATEGORIAS = ['Supermercado', 'Transporte', 'Salud', 'Ocio', 'Servicios']

type Gasto = { monto: number; comercio: string; categoria: string; fecha: string }

type Registro = {
  id: number
  /** Lo único que vería el servidor. */
  cifrado: string
  /**
   * El resultado de DESCIFRAR `cifrado`, no el objeto que se cargó.
   *
   * Es la diferencia entre demostrar algo y dibujarlo: si el panel del celular
   * mostrara el `Gasto` original, la vista comparativa se vería idéntica aunque
   * el cifrado estuviera roto.
   */
  descifrado: Gasto
  msCifrar: number
  msDescifrar: number
}

/** Dos decimales: cifrar un gasto tarda menos de 1 ms y "0" no dice nada. */
function ms(valor: number): string {
  return `${Math.round(valor * 100) / 100} ms`
}

function promedio(valores: number[]): number | null {
  if (valores.length === 0) return null
  return valores.reduce((suma, v) => suma + v, 0) / valores.length
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function SecurityLab() {
  const [pin, setPin] = useState('')
  const [sal, setSal] = useState<string | null>(null)
  const [clave, setClave] = useState<CryptoKey | null>(null)
  const [msDerivar, setMsDerivar] = useState<number | null>(null)

  const [monto, setMonto] = useState('')
  const [comercio, setComercio] = useState('')
  const [categoria, setCategoria] = useState(CATEGORIAS[0])

  const [registros, setRegistros] = useState<Registro[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [token, setToken] = useState('')
  const [drive, setDrive] = useState<ResultadoDeSync | null>(null)

  async function derivar() {
    setError(null)
    setAviso(null)

    if (pin.trim().length < 4) {
      setError('El PIN tiene que tener al menos 4 caracteres.')
      return
    }

    setOcupado(true)
    try {
      // La sal se genera una sola vez y se conserva: es lo que hace que el
      // mismo PIN derive siempre la misma clave. En la app real vendría del
      // perfil del usuario, no de acá.
      const salActual = sal ?? generarSal()

      const arranque = performance.now()
      const derivada = await generateUserKey(pin.trim(), salActual)
      const tardanza = performance.now() - arranque

      setSal(salActual)
      setClave(derivada)
      setMsDerivar(tardanza)
      // Los registros anteriores se descartan: si el PIN cambió, la clave es
      // otra y esos ciphertexts ya no abren. Dejarlos en pantalla sería mostrar
      // un estado que no se puede reproducir.
      setRegistros([])
      setDrive(null)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setOcupado(false)
    }
  }

  async function cifrarGasto(evento: React.FormEvent) {
    evento.preventDefault()
    setError(null)
    setAviso(null)

    if (!clave) return

    const importe = Number(monto)
    if (!Number.isFinite(importe) || importe <= 0) {
      setError('El monto tiene que ser un número mayor a cero.')
      return
    }
    if (!comercio.trim()) {
      setError('Falta el comercio.')
      return
    }

    setOcupado(true)
    try {
      const gasto: Gasto = {
        monto: importe,
        comercio: comercio.trim(),
        categoria,
        fecha: hoyEnArgentina(),
      }

      const antesDeCifrar = performance.now()
      const cifrado = await encryptData(JSON.stringify(gasto), clave)
      const msCifrar = performance.now() - antesDeCifrar

      const antesDeDescifrar = performance.now()
      const vuelta = JSON.parse(await decryptData(cifrado, clave)) as Gasto
      const msDescifrar = performance.now() - antesDeDescifrar

      setRegistros((previos) => [
        { id: previos.length + 1, cifrado, descifrado: vuelta, msCifrar, msDescifrar },
        ...previos,
      ])
      setMonto('')
      setComercio('')
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setOcupado(false)
    }
  }

  /** La prueba de que la clave es lo único que abre el dato. */
  async function probarPinEquivocado() {
    const ultimo = registros[0]
    if (!sal || !ultimo) return

    setError(null)
    setAviso(null)
    setOcupado(true)
    try {
      // Misma sal, PIN distinto: la única variable que cambia es el secreto.
      const claveFalsa = await generateUserKey(`${pin.trim()}0`, sal)
      await decryptData(ultimo.cifrado, claveFalsa)
      setError('Abrió con el PIN equivocado. Eso sería un bug grave del POC.')
    } catch (e) {
      setAviso(`Con otro PIN el mismo dato no abre — ${mensajeDe(e)}`)
    } finally {
      setOcupado(false)
    }
  }

  /** Cifra TODOS los registros como un solo blob y arma el sobre del respaldo. */
  async function armarPayload(): Promise<RespaldoCifrado | null> {
    if (!clave || !sal) return null
    const planos = registros.map((r) => r.descifrado)
    return armarRespaldo(await encryptData(JSON.stringify(planos), clave), sal)
  }

  async function descargar() {
    setError(null)
    setAviso(null)
    setOcupado(true)
    try {
      const sobre = await armarPayload()
      if (!sobre) return
      const nombre = exportLocalBackup(sobre)
      setAviso(`Se descargó ${nombre}. Abrilo: el campo "registros" tiene que ser ilegible.`)
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setOcupado(false)
    }
  }

  async function sincronizar() {
    setError(null)
    setAviso(null)
    setOcupado(true)
    try {
      const sobre = await armarPayload()
      if (!sobre) return
      setDrive(await simulateDriveSync(token, sobre))
    } catch (e) {
      setError(mensajeDe(e))
    } finally {
      setOcupado(false)
    }
  }

  const hayRegistros = registros.length > 0
  const promCifrar = promedio(registros.map((r) => r.msCifrar))
  const promDescifrar = promedio(registros.map((r) => r.msDescifrar))

  return (
    <div className="flex flex-col gap-5">
      <Card className="border-budget-warn/40">
        <CardContent className="flex gap-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-budget-warn" aria-hidden />
          <div className="flex flex-col gap-1.5 text-sm">
            <p className="font-medium tracking-tight">Banco de pruebas, no una función</p>
            <p className="text-muted">
              Nada de lo que cargues acá toca Supabase ni queda guardado: vive en memoria y se
              pierde al recargar. El PIN tampoco se persiste en ningún lado.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* --- 1. La clave ------------------------------------------------- */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <CardLabel>
            <KeyRound className="size-3.5" aria-hidden />
            Paso 1 · PIN de seguridad
          </CardLabel>

          <div className="flex flex-wrap items-end gap-3">
            <label className={`${ETIQUETA_CAMPO} min-w-40 flex-1`}>
              PIN o passphrase de prueba
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="mínimo 4 caracteres"
                autoComplete="off"
                className={CAMPO}
              />
            </label>

            <button
              type="button"
              onClick={derivar}
              disabled={ocupado}
              className="btn-gold flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider disabled:opacity-50"
            >
              {ocupado && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Derivar clave
            </button>
          </div>

          {clave && sal ? (
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-card/60 p-3 text-[11px] text-muted">
              <p className="flex items-center gap-1.5 font-medium text-gold-leaf">
                <ShieldCheck className="size-3.5" aria-hidden />
                Clave AES-GCM-256 lista, en memoria y no extraíble
              </p>
              <p>
                PBKDF2-SHA256 · {ITERACIONES_PBKDF2.toLocaleString('es-AR')} iteraciones ·{' '}
                {msDerivar === null ? '—' : ms(msDerivar)}
              </p>
              <p className="break-all font-mono">sal (pública): {sal}</p>
            </div>
          ) : (
            <p className="text-[11px] text-subtle">
              La clave se deriva del PIN con PBKDF2 y nunca sale del dispositivo. El PIN no viaja:
              lo que viaja es lo que la clave cifró.
            </p>
          )}
        </CardContent>
      </Card>

      {/* --- 2. El gasto de prueba --------------------------------------- */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <CardLabel>
            <Smartphone className="size-3.5" aria-hidden />
            Paso 2 · Cargar un gasto
          </CardLabel>

          <form onSubmit={cifrarGasto} className="grid grid-cols-2 gap-3">
            <label className={ETIQUETA_CAMPO}>
              Monto
              <input
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="12500"
                disabled={!clave}
                className={`${CAMPO} tabular-nums`}
              />
            </label>

            <label className={ETIQUETA_CAMPO}>
              Categoría
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                disabled={!clave}
                className={CAMPO}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className={`col-span-2 ${ETIQUETA_CAMPO}`}>
              Comercio
              <input
                value={comercio}
                onChange={(e) => setComercio(e.target.value)}
                placeholder="Farmacia del Centro"
                disabled={!clave}
                className={CAMPO}
              />
            </label>

            <button
              type="submit"
              disabled={!clave || ocupado}
              className="btn-gold col-span-2 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider disabled:opacity-50"
            >
              {ocupado && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Cifrar registro
            </button>
          </form>

          {!clave && (
            <p className="text-[11px] text-subtle">Derivá la clave para habilitar el formulario.</p>
          )}
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="rounded-xl bg-error-rose/10 px-3 py-2 text-xs text-error-rose">
          {error}
        </p>
      )}
      {aviso && (
        <p className="rounded-xl bg-gold-leaf/10 px-3 py-2 text-xs text-gold-leaf">{aviso}</p>
      )}

      {/* --- 3. Vista comparativa ---------------------------------------- */}
      {hayRegistros && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card glass className="overflow-hidden">
            <CardContent className="flex flex-col gap-3">
              <CardLabel className="text-gold-leaf">
                <Smartphone className="size-3.5" aria-hidden />
                Celular del usuario · descifrado
              </CardLabel>
              <p className="-mt-1.5 text-[10px] text-subtle">
                Esto no es el objeto que cargaste: es el que volvió de descifrar la columna de al
                lado.
              </p>

              <ul className="flex flex-col gap-2">
                {registros.map((r) => (
                  <li key={r.id} className="rounded-xl border border-border bg-card/60 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium tracking-tight">
                        {r.descifrado.comercio}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-expense">
                        {r.descifrado.monto.toLocaleString('es-AR', {
                          style: 'currency',
                          currency: 'ARS',
                        })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-subtle">
                      {r.descifrado.categoria} · {r.descifrado.fecha}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="flex flex-col gap-3">
              <CardLabel>
                <Server className="size-3.5" aria-hidden />
                Base de datos / servidor · cifrado
              </CardLabel>
              <p className="-mt-1.5 text-[10px] text-subtle">
                Una sola columna de texto por registro. El servidor no tiene la clave, así que esto
                es todo lo que puede leer, indexar o filtrar.
              </p>

              <ul className="flex flex-col gap-2">
                {registros.map((r) => (
                  <li
                    key={r.id}
                    className="break-all rounded-xl border border-border bg-card/60 p-3 font-mono text-[10px] leading-relaxed text-on-surface-variant"
                  >
                    {r.cifrado}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {/* --- 4. Latencia -------------------------------------------------- */}
      {(msDerivar !== null || hayRegistros) && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <CardLabel>
              <Timer className="size-3.5" aria-hidden />
              Medidor de latencia
            </CardLabel>

            <div className="grid grid-cols-3 gap-3">
              {[
                { rotulo: 'Derivar clave', valor: msDerivar, nota: 'una vez por sesión' },
                { rotulo: 'Cifrar', valor: promCifrar, nota: 'promedio por registro' },
                { rotulo: 'Descifrar', valor: promDescifrar, nota: 'promedio por registro' },
              ].map((m) => (
                <div key={m.rotulo} className="rounded-xl border border-border bg-card/60 p-3">
                  <p className="text-[10px] text-subtle">{m.rotulo}</p>
                  <p className="mt-1 font-display text-base font-bold tabular-nums text-gold-leaf">
                    {m.valor === null ? '—' : ms(m.valor)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-subtle">{m.nota}</p>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-muted">
              La derivación es cara a propósito: son {ITERACIONES_PBKDF2.toLocaleString('es-AR')}{' '}
              iteraciones para encarecerle cada intento a quien quiera adivinar el PIN. Cifrar y
              descifrar, en cambio, tienen que ser imperceptibles — si acá se van a decenas de
              milisegundos, una lista de 500 movimientos va a arrastrarse.
            </p>

            {hayRegistros && (
              <button
                type="button"
                onClick={probarPinEquivocado}
                disabled={ocupado}
                className={BOTON_SECUNDARIO}
              >
                Probar a descifrar con el PIN equivocado
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* --- 5. Respaldo -------------------------------------------------- */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <CardLabel>
            <CloudUpload className="size-3.5" aria-hidden />
            Paso 3 · Respaldo cifrado
          </CardLabel>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={descargar}
              disabled={!hayRegistros || ocupado}
              className={BOTON_SECUNDARIO}
            >
              <Download className="size-4" aria-hidden />
              Descargar backup cifrado (JSON)
            </button>

            <button
              type="button"
              onClick={sincronizar}
              disabled={!hayRegistros || ocupado}
              className={BOTON_SECUNDARIO}
            >
              <CloudUpload className="size-4" aria-hidden />
              Probar sincronización con Google Drive
            </button>
          </div>

          <label className={ETIQUETA_CAMPO}>
            Access token de Google (opcional)
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="vacío = simulación, no sale nada del dispositivo"
              autoComplete="off"
              className={CAMPO}
            />
            <span className="text-[10px] font-normal leading-snug text-subtle">
              Sin token el botón arma la petición y te la muestra, pero no la manda. Con un token
              del alcance <code className="font-mono">{ALCANCE_DRIVE}</code> —del OAuth Playground,
              por ejemplo— sube de verdad al appDataFolder.
            </span>
          </label>

          {drive && <ResultadoDrive resultado={drive} />}
        </CardContent>
      </Card>
    </div>
  )
}

function ResultadoDrive({ resultado }: { resultado: ResultadoDeSync }) {
  if (resultado.estado === 'error') {
    return (
      <div role="alert" className="rounded-xl bg-error-rose/10 p-3 text-xs text-error-rose">
        <p className="font-medium">Falló la sincronización{resultado.codigo && ` (${resultado.codigo})`}</p>
        <p className="mt-1 break-all font-mono text-[10px]">{resultado.mensaje}</p>
      </div>
    )
  }

  if (resultado.estado === 'subido') {
    return (
      <div className="rounded-xl bg-gold-leaf/10 p-3 text-xs text-gold-leaf">
        <p className="font-medium">
          {resultado.actualizado ? 'Respaldo actualizado' : 'Respaldo creado'} en appDataFolder ·{' '}
          {resultado.ms} ms
        </p>
        <p className="mt-1 break-all font-mono text-[10px]">
          {resultado.nombre} · id {resultado.id}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3">
      <p className="text-[11px] text-muted">{resultado.motivo}</p>
      <p className="font-mono text-[10px] text-on-surface-variant">
        {resultado.peticion.metodo} {resultado.peticion.url}
      </p>
      <p className="text-[10px] text-subtle">
        {resultado.peticion.bytes.toLocaleString('es-AR')} bytes de cuerpo. Esto es lo que subiría —
        revisá que no haya un solo campo legible:
      </p>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-card p-2 font-mono text-[10px] leading-relaxed text-on-surface-variant">
        {resultado.peticion.cuerpo}
      </pre>
    </div>
  )
}
