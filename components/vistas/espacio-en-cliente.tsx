'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Lock } from 'lucide-react'
import { GuardianDeBoveda } from '@/components/guardian-de-boveda'
import { useEstadoDelLibro } from '@/components/libro-provider'
import { SharedSpaceDetail } from '@/components/shared-space-detail'
import { entrarAlGrupo, repartirLlavePendiente } from '@/lib/almacen/acceso-al-grupo'
import { abrirEspacio, type EspacioAbierto } from '@/lib/almacen/compartidos'
import { miembrosDelEspacio } from '@/lib/almacen/espacios'
import { recifrarPendientes } from '@/lib/almacen/recifrado'
import {
  calcularBalances,
  calcularLiquidacion,
  cargarEspacioCrudo,
  type Espacio,
  type Miembro,
} from '@/lib/shared-expenses-service'
import { createClient } from '@/lib/supabase/client'

/**
 * EL GRUPO, ABIERTO EN EL NAVEGADOR
 * =============================================================================
 *
 * El servidor trae lo que puede leer —quiénes son y cómo se llama el grupo— y
 * se detiene ahí. Los gastos los abre esto, con la llave del grupo, que sale de
 * la contraseña del usuario y nunca sale de su máquina.
 *
 * LAS TRES COSAS QUE HACE AL ABRIR, Y POR QUÉ SON AUTOMÁTICAS
 *
 *   1. se asegura de tener par de claves y publica su pública
 *   2. si es admin, le reparte la llave a los que están esperando
 *   3. si quedan filas en claro, las re-cifra
 *
 * Ninguna es un botón. Un botón "cifrar mis gastos" que el usuario no aprieta
 * deja los datos legibles para siempre, y "esperando acceso" no es un estado
 * que nadie quiera administrar a mano. Que pase solo al abrir el grupo es lo
 * que hace que la promesa se cumpla sin depender de que alguien se acuerde.
 */
export function EspacioEnCliente(props: {
  espacio: Espacio
  miembros: Miembro[]
  generacion: number
  miMiembroId: string
  soyElCreador: boolean
  soyAdmin: boolean
  userId: string
  nombres: Record<string, string>
}) {
  return (
    <GuardianDeBoveda>
      <ContenidoDelEspacio {...props} />
    </GuardianDeBoveda>
  )
}

type Estado =
  | { fase: 'cargando' }
  | {
      fase: 'listo'
      abierto: EspacioAbierto
      llave: { gek: CryptoKey; generacion: number } | null
      sinLlave: boolean
    }
  | { fase: 'error'; mensaje: string }

function ContenidoDelEspacio({
  espacio,
  miembros,
  generacion,
  miMiembroId,
  soyElCreador,
  soyAdmin,
  userId,
  nombres,
}: {
  espacio: Espacio
  miembros: Miembro[]
  generacion: number
  miMiembroId: string
  soyElCreador: boolean
  soyAdmin: boolean
  userId: string
  nombres: Record<string, string>
}) {
  const estadoDelLibro = useEstadoDelLibro()
  const claves = estadoDelLibro.fase === 'abierto' ? estadoDelLibro.claves : null

  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  // Cambia cuando alguien guarda algo: es lo que reemplaza a `router.refresh()`,
  // que acá no serviría porque los datos no los trae el servidor.
  const [version, setVersion] = useState(0)
  const recargar = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    if (!claves) return
    let vigente = true

    void (async () => {
      const supabase = createClient()

      try {
        const acceso = await entrarAlGrupo(supabase, {
          userId,
          spaceId: espacio.id,
          miMiembroId,
          soyElCreador,
          generacion,
          claves,
        })

        // Repartir antes de leer: si acabo de darle la llave a alguien, que la
        // pantalla ya lo muestre como miembro con acceso.
        if (soyAdmin && acceso.gek) {
          const pendientes = (await miembrosDelEspacio(supabase, espacio.id, acceso.generacion))
            .filter((m) => m.pendiente && m.publica)
            .map((m) => ({ memberId: m.memberId, publica: m.publica as JsonWebKey }))

          if (pendientes.length > 0) {
            await repartirLlavePendiente(supabase, espacio.id, acceso.generacion, acceso.gek, pendientes)
          }
        }

        const { crudo, error } = await cargarEspacioCrudo(supabase, espacio.id)
        if (error) throw new Error(error)

        let abierto = await abrirEspacio(crudo, acceso.llaves)

        // Lo que todavía estaba legible se cifra ahora, con lo que ya está
        // abierto en memoria: no hace falta volver a leer nada.
        if (acceso.gek) {
          const recifradas = await recifrarPendientes(supabase, abierto, acceso.gek, acceso.generacion)
          if (recifradas > 0) {
            abierto = { ...abierto, pendientesDeCifrar: { gastos: [], liquidaciones: [], objetivos: [] } }
          }
        }

        if (!vigente) return
        setEstado({
          fase: 'listo',
          abierto,
          llave: acceso.gek ? { gek: acceso.gek, generacion: acceso.generacion } : null,
          sinLlave: acceso.sinLlave,
        })
      } catch (error) {
        if (!vigente) return
        setEstado({
          fase: 'error',
          mensaje: error instanceof Error ? error.message : 'No se pudo abrir el grupo.',
        })
      }
    })()

    return () => {
      vigente = false
    }
  }, [claves, espacio.id, generacion, miMiembroId, soyElCreador, soyAdmin, userId, version])

  if (estado.fase === 'cargando') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status">
        <Loader2 className="size-6 animate-spin text-gold-leaf" aria-hidden />
      </div>
    )
  }

  if (estado.fase === 'error') {
    return (
      <p
        role="alert"
        className="rounded-2xl border border-expense/30 bg-expense/10 px-4 py-3 text-sm text-expense"
      >
        {estado.mensaje}
      </p>
    )
  }

  const { abierto, llave, sinLlave } = estado

  const balances = calcularBalances(
    abierto.gastos,
    miembros.map((m) => m.id),
    abierto.liquidaciones
  )

  return (
    <div className="flex flex-col gap-4">
      {sinLlave && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-2xl border border-gold-leaf/40 bg-gold-leaf/5 px-4 py-3 text-sm text-on-surface-variant"
        >
          <Lock className="mt-0.5 size-4 shrink-0 text-gold-leaf" aria-hidden />
          <span>
            Todavía no tenés la llave de este grupo, así que no ves los gastos cifrados. Un
            administrador te la da con sólo abrir el grupo.
          </span>
        </p>
      )}

      <SharedSpaceDetail
        espacio={espacio}
        miembros={miembros}
        gastos={abierto.gastos}
        liquidaciones={abierto.liquidaciones}
        objetivos={abierto.objetivos}
        balances={balances}
        liquidacion={calcularLiquidacion(balances)}
        nombres={nombres}
        miMiembroId={miMiembroId}
        llave={llave}
        alCambiar={recargar}
      />
    </div>
  )
}
