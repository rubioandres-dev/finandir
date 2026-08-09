'use client'

import { ITERACIONES_PBKDF2 } from '@/lib/crypto'
import { hoyEnArgentina } from '@/lib/types'

/**
 * Respaldo cifrado: al disco del usuario y a su Google Drive.
 *
 * QUÉ VIAJA Y QUÉ NO
 *
 * Viaja el ciphertext, la sal y los parámetros del KDF. No viaja el PIN ni la
 * clave derivada, y por eso el archivo es inútil para cualquiera que lo
 * levante —incluido Google, que lo va a tener alojado—.
 *
 * La sal SÍ va adentro, y no es una filtración: es un requisito. Sin ella el
 * PIN correcto deriva otra clave y el respaldo no abre nunca más. Lo mismo con
 * `iteraciones`: si mañana se sube el número, los archivos viejos siguen
 * abriéndose porque cada uno declara con qué se lo hizo. Un respaldo cifrado
 * que no puede describirse a sí mismo es un archivo perdido con pasos extra.
 *
 * POR QUÉ appDataFolder Y NO UNA CARPETA NORMAL
 *
 * `appDataFolder` es un espacio oculto por aplicación dentro del Drive del
 * usuario. Le cuenta contra su cuota y puede borrarlo, pero no lo ve en la
 * lista de archivos ni lo puede mover, y ninguna otra app lo alcanza. El
 * permiso que pide —`drive.appdata`— no da acceso a NADA más del Drive: es la
 * diferencia entre pedir "guardar mis cosas" y pedir "leer todos tus archivos",
 * y es la única versión de esto que se le puede pedir a un usuario sin que
 * cierre la pestaña.
 */

/** Un solo archivo que se pisa a sí mismo: el respaldo es un estado, no un log. */
export const NOMBRE_EN_DRIVE = 'aurem-backup.json'

/** El único permiso que hace falta. Ver arriba por qué importa que sea ese. */
export const ALCANCE_DRIVE = 'https://www.googleapis.com/auth/drive.appdata'

/** El sobre que se baja y se sube. Todo menos la clave. */
export type RespaldoCifrado = {
  formato: 'aurem-backup-v1'
  /** ISO 8601, para poder comparar dos respaldos sin abrirlos. */
  creado: string
  /** Con qué se derivó la clave. Sin esto el archivo no se puede abrir. */
  kdf: {
    nombre: 'PBKDF2'
    hash: 'SHA-256'
    iteraciones: number
    /** Base64. Pública por diseño. */
    sal: string
  }
  /** Los registros del usuario, ya cifrados: `v1.<iv>.<datos>`. */
  registros: string
}

/** Arma el sobre. El ciphertext ya viene hecho por `encryptData`. */
export function armarRespaldo(registrosCifrados: string, sal: string): RespaldoCifrado {
  return {
    formato: 'aurem-backup-v1',
    // ISO completo y no `hoyEnArgentina()`: la fecha del NOMBRE es para el
    // usuario, la del contenido es para decidir cuál de dos respaldos es más
    // nuevo, y ahí los minutos importan.
    creado: new Date().toISOString(),
    kdf: { nombre: 'PBKDF2', hash: 'SHA-256', iteraciones: ITERACIONES_PBKDF2, sal },
    registros: registrosCifrados,
  }
}

/**
 * Baja el respaldo como `aurem_backup_YYYY-MM-DD.json`, en un click.
 *
 * Sin `showSaveFilePicker`: existe y es más lindo, pero no está en Safari ni en
 * Firefox, que es donde vive medio Aurem. El `<a download>` sintético funciona
 * en todos y no pide permisos.
 *
 * Devuelve el nombre del archivo para poder mostrarlo en la UI.
 */
export function exportLocalBackup(data: RespaldoCifrado): string {
  const nombre = `aurem_backup_${hoyEnArgentina()}.json`

  // Indentado a 2: el archivo se abre a mano durante el POC para verificar a
  // ojo que no hay nada legible adentro. El costo en bytes es irrelevante.
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()

  // Sin esto el Blob queda vivo hasta que se cierre la pestaña. Con respaldos
  // de varios MB y un usuario que exporta seguido, eso es una fuga real.
  URL.revokeObjectURL(url)

  return nombre
}

/** Lo que se le mandaría a Google, para poder mirarlo sin mandarlo. */
export type PeticionPreparada = {
  metodo: 'POST' | 'PATCH'
  url: string
  cabeceras: Record<string, string>
  /** Bytes del cuerpo. El contenido no se muestra entero: es largo y opaco. */
  bytes: number
  /** Qué se subiría, ya serializado, para inspección en el laboratorio. */
  cuerpo: string
}

export type ResultadoDeSync =
  /** No se mandó nada: no había token. El POC corre igual y muestra la petición. */
  | { estado: 'simulado'; peticion: PeticionPreparada; motivo: string }
  | { estado: 'subido'; id: string; nombre: string; actualizado: boolean; ms: number }
  | { estado: 'error'; codigo: number | null; mensaje: string }

const LIMITE = 'aurem-poc-limite'

/**
 * Cuerpo `multipart/related`: metadatos y contenido en una sola llamada.
 *
 * Los saltos son CRLF y no `\n` porque así lo pide MIME; con `\n` pelado la
 * API de Drive responde 400 y el mensaje no dice por qué.
 */
function cuerpoMultipart(metadatos: object, contenido: string): string {
  return [
    `--${LIMITE}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadatos),
    `--${LIMITE}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    contenido,
    `--${LIMITE}--`,
    '',
  ].join('\r\n')
}

/** El id del respaldo que ya está en Drive, o null si es el primero. */
async function buscarExistente(accessToken: string): Promise<string | null> {
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  // `spaces=appDataFolder` es obligatorio: sin él la búsqueda corre sobre el
  // Drive visible, donde este archivo no está, y siempre vuelve vacía. El
  // síntoma es un respaldo nuevo por cada sync en vez de uno que se actualiza.
  url.searchParams.set('spaces', 'appDataFolder')
  url.searchParams.set('q', `name = '${NOMBRE_EN_DRIVE}'`)
  url.searchParams.set('fields', 'files(id,name,modifiedTime)')

  const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!respuesta.ok) return null

  const datos: unknown = await respuesta.json()
  const archivos = (datos as { files?: { id?: string }[] }).files
  return archivos?.[0]?.id ?? null
}

/**
 * Sube el respaldo cifrado al `appDataFolder` del usuario.
 *
 * SIN TOKEN NO SALE UN SOLO BYTE DEL DISPOSITIVO. En ese caso arma la petición
 * exacta y la devuelve para inspección, que es para lo que sirve en el POC:
 * todavía no hay flujo de OAuth, y lo que hay que validar ahora es que lo que
 * se subiría es ilegible, no que Google conteste 200.
 *
 * Con un token real —pegado a mano desde el OAuth Playground— sí la manda, y
 * pisa el respaldo anterior en vez de acumular copias.
 */
export async function simulateDriveSync(
  accessToken: string,
  encryptedPayload: RespaldoCifrado
): Promise<ResultadoDeSync> {
  const contenido = JSON.stringify(encryptedPayload)

  if (!accessToken.trim()) {
    const cuerpo = cuerpoMultipart(
      { name: NOMBRE_EN_DRIVE, parents: ['appDataFolder'] },
      contenido
    )

    return {
      estado: 'simulado',
      motivo: `Sin access token no se envía nada. Esta es la petición que saldría; hace falta el alcance ${ALCANCE_DRIVE}.`,
      peticion: {
        metodo: 'POST',
        url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        cabeceras: {
          Authorization: 'Bearer <access token del usuario>',
          'Content-Type': `multipart/related; boundary=${LIMITE}`,
        },
        bytes: new TextEncoder().encode(cuerpo).length,
        cuerpo,
      },
    }
  }

  const arranque = performance.now()

  try {
    const existente = await buscarExistente(accessToken)

    // Al actualizar va `uploadType=media` y solo el contenido: el nombre y el
    // padre ya están puestos, y `parents` en un PATCH es un error de la API.
    const url = existente
      ? `https://www.googleapis.com/upload/drive/v3/files/${existente}?uploadType=media`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'

    const respuesta = await fetch(url, {
      method: existente ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': existente
          ? 'application/json; charset=UTF-8'
          : `multipart/related; boundary=${LIMITE}`,
      },
      body: existente
        ? contenido
        : cuerpoMultipart({ name: NOMBRE_EN_DRIVE, parents: ['appDataFolder'] }, contenido),
    })

    if (!respuesta.ok) {
      const texto = await respuesta.text()
      return { estado: 'error', codigo: respuesta.status, mensaje: texto.slice(0, 400) }
    }

    const datos = (await respuesta.json()) as { id?: string; name?: string }

    return {
      estado: 'subido',
      id: datos.id ?? existente ?? '',
      nombre: datos.name ?? NOMBRE_EN_DRIVE,
      actualizado: existente !== null,
      ms: Math.round(performance.now() - arranque),
    }
  } catch (error) {
    // Un token vencido da 401 y cae arriba; acá caen la red caída y el CORS.
    return {
      estado: 'error',
      codigo: null,
      mensaje: error instanceof Error ? error.message : String(error),
    }
  }
}
