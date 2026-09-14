import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

/**
 * La frontera entre el servidor y el cliente, vigilada.
 *
 * En un modulo `'use client'` TODOS los exports son referencias, no valores: el
 * servidor los puede RENDERIZAR, no llamar. Si una pagina del servidor importa
 * de ahi una funcion o una constante y la usa, la pagina explota en produccion
 * con un digest y nada mas —ni TypeScript ni ESLint lo ven, porque los tipos
 * son correctos y el import existe.
 *
 * Eso fue exactamente lo que tiro la app: ocho pantallas llamaban desde el
 * servidor a `armarDatos*()`, que vivia dentro del modulo de la pantalla.
 *
 * La regla que se comprueba: una pagina del servidor solo puede traerse de un
 * modulo cliente cosas que se renderizan. En la practica, nombres en
 * PascalCase. Lo demas —`armarDatos`, `TASA_RETIRO_SEGURO`— tiene que vivir en
 * un modulo sin `'use client'`, que las dos rutas pueden importar.
 */

const RAIZ = resolve(__dirname, '..')

function archivos(carpeta: string, extensiones: string[]): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(carpeta)) {
    if (entrada === 'node_modules' || entrada.startsWith('.')) continue
    const ruta = join(carpeta, entrada)
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, extensiones))
    else if (extensiones.some((e) => entrada.endsWith(e))) salida.push(ruta)
  }
  return salida
}

function esCliente(texto: string): boolean {
  return /^\s*['"]use client['"]/.test(texto)
}

/** `@/lib/x` y `./x` -> ruta real en disco, con la extension que exista. */
function resolverModulo(desde: string, especificador: string): string | null {
  if (!especificador.startsWith('@/') && !especificador.startsWith('.')) return null
  const base = especificador.startsWith('@/')
    ? join(RAIZ, especificador.slice(2))
    : resolve(dirname(desde), especificador)
  for (const candidato of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
  ]) {
    try {
      if (statSync(candidato).isFile()) return candidato
    } catch {
      /* sigue probando */
    }
  }
  return null
}

const IMPORT = /^import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm

describe('frontera entre servidor y cliente', () => {
  it('ninguna pagina del servidor importa valores de un modulo cliente', () => {
    const infracciones: string[] = []

    for (const ruta of archivos(join(RAIZ, 'app'), ['.ts', '.tsx'])) {
      const texto = readFileSync(ruta, 'utf8')
      if (esCliente(texto)) continue // Un modulo cliente puede importar de otro.

      for (const m of texto.matchAll(IMPORT)) {
        const [, soloTipo, cuerpo, especificador] = m
        if (soloTipo) continue

        const destino = resolverModulo(ruta, especificador)
        if (!destino) continue
        if (!esCliente(readFileSync(destino, 'utf8'))) continue

        for (const bruto of cuerpo.split(',')) {
          const pieza = bruto.trim()
          if (!pieza || pieza.startsWith('type ')) continue
          const local = (pieza.includes(' as ') ? pieza.split(' as ')[1] : pieza).trim()

          // PascalCase: un componente, que el servidor renderiza sin llamarlo.
          if (/^[A-Z][A-Za-z0-9]*$/.test(local)) continue

          infracciones.push(
            `${ruta.slice(RAIZ.length + 1).replace(/\\/g, '/')}: ` +
              `importa \`${local}\` de \`${especificador}\`, que es 'use client'`,
          )
        }
      }
    }

    expect(infracciones).toEqual([])
  })
})
