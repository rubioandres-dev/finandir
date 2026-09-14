'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useLibro } from '@/components/libro-provider'
import type { Libro } from '@/lib/almacen/libro'

/**
 * CARGAR DATOS EN EL NAVEGADOR
 * =============================================================================
 *
 * En modo Bóveda el servidor no puede leer nada, así que cada pantalla con datos
 * necesita un cargador que corra acá. Este componente es ese cargador, una sola
 * vez, para todas.
 *
 * `cargar` recibe el libro del navegador y devuelve lo que la vista necesita.
 * Es la MISMA función que llama el `page.tsx` del modo Estándar — las services
 * reciben un `Libro` y no les importa cuál.
 *
 *     <CargadorEnCliente
 *       cargar={(libro) => cargarCuentasYDeudas(libro, monedas)}
 *       ver={(datos) => <VistaDeudas {...datos} />}
 *     />
 *
 * POR QUÉ NO USA `use()` NI SUSPENSE
 *
 * Se podría, y quedaría más corto. Pero `use()` quiere una promesa ESTABLE entre
 * renders, y acá la promesa depende del libro y del cierre que le pasen: una
 * dependencia mal puesta la recrearía en cada render y el componente entraría en
 * un ciclo de suspensión infinito. Un efecto con su bandera de cancelación es
 * más largo de leer y no tiene esa trampa.
 */
export function CargadorEnCliente<T>({
  cargar,
  ver,
}: {
  cargar: (libro: Libro) => Promise<T>
  ver: (datos: T) => React.ReactNode
}) {
  const libro = useLibro()
  const [estado, setEstado] = useState<
    { fase: 'cargando' } | { fase: 'listo'; datos: T } | { fase: 'error'; mensaje: string }
  >({ fase: 'cargando' })

  useEffect(() => {
    let vigente = true

    void (async () => {
      try {
        const datos = await cargar(libro)
        if (vigente) setEstado({ fase: 'listo', datos })
      } catch (error) {
        if (!vigente) return
        setEstado({
          fase: 'error',
          mensaje: error instanceof Error ? error.message : 'No se pudieron leer los datos.',
        })
      }
    })()

    return () => {
      // Si la pantalla se desmonta antes de que llegue la respuesta, no se
      // toca el estado de un componente que ya no está.
      vigente = false
    }
    // `cargar` es un cierre nuevo en cada render de quien nos monta. Depender de
    // el volveria a leer sin parar; el libro es lo unico que de verdad cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libro])

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

  return <>{ver(estado.datos)}</>
}
