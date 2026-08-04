/**
 * Genera los íconos de la app a partir del logo AUREM, definido acá como
 * geometría vectorial. Correr con: `node scripts/generate-icons.mjs`
 *
 * Por qué geometría y no texto: la "A" del wordmark es Montserrat ExtraBold,
 * que se carga por `next/font/google` y no está instalada en el sistema. Un
 * `<text>` en el SVG se rasterizaría con la fuente de fallback y el logo
 * saldría distinto en cada máquina. Los contornos son deterministas.
 *
 * `sharp` viene de las dependencias de Next (optimizador de imágenes); este
 * script es solo de build, no se importa desde la app.
 */
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'

// Tokens de app/globals.css. Mantener sincronizados a mano: un script de build
// no puede leer las variables CSS resueltas.
const NAVY = '#0a0c14' // --midnight-navy
const NAVY_ALTO = '#141826' // navy aclarado, para la profundidad del fondo
const ORO_CLARO = '#f2ca4f' // --gold-leaf
const ORO_OSCURO = '#d4af35' // cierre de .fire-gradient
const CARBON = '#1a1c26' // --charcoal, riel de la barra

// --- La letra "A" -----------------------------------------------------------
// Caja local de 100 × 88 (ancho × alto de altura de caja). La forma es una
// silueta triangular con dos huecos, resueltos por `fill-rule: evenodd`: el
// ojo sobre la barra y el vano entre las patas.
//
// Derivada de: ápice plano de 7 de ancho, patas de 23 medidas en horizontal y
// barra transversal entre y=60 e y=74. Los bordes internos de las patas son
// los externos desplazados 23, y se cruzan en y=36.9032 — ahí nace el ojo.
const A_SILUETA = 'M46.5 0 L53.5 0 L100 88 L0 88 Z'
const A_OJO = 'M50 36.9032 L62.2045 60 L37.7955 60 Z'
const A_VANO = 'M30.3977 74 L69.6023 74 L77 88 L23 88 Z'
const A_ANCHO = 100
const A_ALTO = 88

/**
 * Construye el SVG del logo.
 *
 * @param {object} opts
 * @param {number} opts.lado          Lado del lienzo cuadrado.
 * @param {number} opts.radio         Radio de las esquinas. 0 = full-bleed.
 * @param {number} opts.anchoA        Ancho de la "A" en px del lienzo.
 * @param {boolean} opts.barra        Incluir la barra "EXCELLENCE 30%".
 * @param {boolean} opts.borde        Filete de oro en el perímetro.
 * @param {boolean} opts.orbitas      Arcos decorativos de la pieza de marca.
 */
function svgLogo({ lado, radio, anchoA, barra, borde, orbitas: conOrbitas = true }) {
  const escala = anchoA / A_ANCHO
  const altoA = A_ALTO * escala

  // La barra repite la proporción de la pieza de identidad: separación y grosor
  // relativos al ancho del wordmark, no absolutos, para que escale parejo.
  const separacion = anchoA * 0.19
  const grosorBarra = Math.max(2, anchoA * 0.039)
  const altoTotal = barra ? altoA + separacion + grosorBarra : altoA

  const x = (lado - anchoA) / 2
  const y = (lado - altoTotal) / 2
  const yBarra = y + altoA + separacion

  // Las órbitas se recortan al marco para que no asomen fuera de las esquinas
  // redondeadas.
  const orbitas = !conOrbitas
    ? ''
    : `
    <g clip-path="url(#marco)" fill="none" stroke="${ORO_OSCURO}">
      <circle cx="${-lado * 0.06}" cy="${-lado * 0.06}" r="${lado * 0.49}"
              stroke-opacity="0.16" stroke-width="${lado * 0.011}"/>
      <circle cx="${-lado * 0.06}" cy="${-lado * 0.06}" r="${lado * 0.33}"
              stroke-opacity="0.1" stroke-width="${lado * 0.009}"/>
      <circle cx="${lado * 1.09}" cy="${lado * 1.13}" r="${lado * 0.55}"
              stroke-opacity="0.12" stroke-width="${lado * 0.012}"/>
    </g>`

  const filete = borde
    ? `<rect x="${lado * 0.004}" y="${lado * 0.004}"
             width="${lado * 0.992}" height="${lado * 0.992}"
             rx="${Math.max(0, radio - lado * 0.004)}"
             fill="none" stroke="${ORO_OSCURO}" stroke-opacity="0.3"
             stroke-width="${lado * 0.008}"/>`
    : ''

  const elementoBarra = barra
    ? `<rect x="${x}" y="${yBarra}" width="${anchoA}" height="${grosorBarra}"
             rx="${grosorBarra / 2}" fill="${CARBON}"/>
       <rect x="${x}" y="${yBarra}" width="${anchoA * 0.3}" height="${grosorBarra}"
             rx="${grosorBarra / 2}" fill="url(#oro)"/>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${NAVY_ALTO}"/>
      <stop offset="1" stop-color="${NAVY}"/>
    </linearGradient>
    <linearGradient id="oro" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ORO_CLARO}"/>
      <stop offset="1" stop-color="${ORO_OSCURO}"/>
    </linearGradient>
    <clipPath id="marco">
      <rect width="${lado}" height="${lado}" rx="${radio}"/>
    </clipPath>
  </defs>
  <rect width="${lado}" height="${lado}" rx="${radio}" fill="url(#fondo)"/>
  ${orbitas}
  ${filete}
  <g transform="translate(${x} ${y}) scale(${escala})" fill="url(#oro)" fill-rule="evenodd">
    <path d="${A_SILUETA} ${A_OJO} ${A_VANO}"/>
  </g>
  ${elementoBarra}
</svg>`
}

const png = (svg, lado) =>
  sharp(Buffer.from(svg)).resize(lado, lado).png({ compressionLevel: 9 }).toBuffer()

/**
 * Empaqueta varios PNG en un .ico. El formato admite PNG embebido desde
 * Vista; todos los navegadores vigentes lo leen, y evita tener que armar los
 * bitmaps BMP con su máscara AND.
 */
function ico(imagenes) {
  const CABECERA = 6
  const ENTRADA = 16
  const cabecera = Buffer.alloc(CABECERA)
  cabecera.writeUInt16LE(0, 0) // reservado
  cabecera.writeUInt16LE(1, 2) // tipo 1 = ícono
  cabecera.writeUInt16LE(imagenes.length, 4)

  let offset = CABECERA + ENTRADA * imagenes.length
  const entradas = imagenes.map(({ lado, datos }) => {
    const e = Buffer.alloc(ENTRADA)
    e.writeUInt8(lado >= 256 ? 0 : lado, 0) // 0 significa 256
    e.writeUInt8(lado >= 256 ? 0 : lado, 1)
    e.writeUInt8(0, 2) // paleta: ninguna
    e.writeUInt8(0, 3) // reservado
    e.writeUInt16LE(1, 4) // planos
    e.writeUInt16LE(32, 6) // bits por píxel
    e.writeUInt32LE(datos.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += datos.length
    return e
  })

  return Buffer.concat([cabecera, ...entradas, ...imagenes.map((i) => i.datos)])
}

// --- Salidas ----------------------------------------------------------------
// El radio 0.22 del lado es la proporción del squircle de iOS, la misma que
// usaba el ícono anterior.
const CUADRADO = { radio: 0.22, anchoA: 0.449, barra: true, borde: true }

const SALIDAS = [
  // Íconos del manifest: son los que ve Android al instalar la PWA.
  { archivo: 'public/icons/icon-192.png', lado: 192, ...CUADRADO },
  { archivo: 'public/icons/icon-512.png', lado: 512, ...CUADRADO },
  // Maskable: full-bleed y sin filete, porque el launcher recorta el borde.
  // El logo entra al 85% del círculo de seguridad (radio 40% del lado).
  {
    archivo: 'public/icons/icon-maskable-512.png',
    lado: 512,
    radio: 0,
    anchoA: 0.382,
    barra: true,
    borde: false,
  },
  // iOS redondea el apple-touch-icon por su cuenta: se entrega cuadrado.
  {
    archivo: 'app/apple-icon.png',
    lado: 180,
    radio: 0,
    anchoA: 0.449,
    barra: true,
    borde: false,
  },
]

for (const { archivo, lado, radio, anchoA, barra, borde } of SALIDAS) {
  const svg = svgLogo({
    lado: 512,
    radio: radio * 512,
    anchoA: anchoA * 512,
    barra,
    borde,
  })
  await writeFile(archivo, await png(svg, lado))
  console.log(`${archivo}  ${lado}×${lado}`)
}

// Favicon: a 16 px la barra desaparece y el filete y las órbitas se vuelven
// ruido, así que esta variante es solo la "A", más grande para que aguante la
// pestaña.
const svgFavicon = svgLogo({
  lado: 512,
  radio: 0.22 * 512,
  anchoA: 0.586 * 512,
  barra: false,
  borde: false,
  orbitas: false,
})
const capas = await Promise.all(
  [16, 32, 48, 64].map(async (lado) => ({ lado, datos: await png(svgFavicon, lado) }))
)
await writeFile('app/favicon.ico', ico(capas))
console.log(`app/favicon.ico   ${capas.map((c) => c.lado).join(', ')}`)
