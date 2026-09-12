/**
 * Corre el contrato de `Almacen` contra las implementaciones que se pueden
 * instanciar sin red.
 *
 * `crearAlmacenNube` y el futuro `crearAlmacenDrive` usan la MISMA suite, pero
 * necesitan un proyecto de Supabase con migrations/018 corrida y una sesión
 * real. Cuando eso exista, se agregan acá:
 *
 *     probarContratoDeAlmacen('nube', () => crearAlmacenNube(supabaseDeTest))
 */

import { probarContratoDeAlmacen } from './contrato'
import { crearAlmacenCifrado, crearSobre } from './cripto'
import { crearAlmacenEnMemoria } from './memoria'

probarContratoDeAlmacen('memoria', () => crearAlmacenEnMemoria())

// El envoltorio de cifrado TAMBIEN es un Almacen y tiene que cumplir el mismo
// contrato: si rompiera alguna de estas reglas, el lazo de reintentos dejaria
// de protegerte justo en el modo que guarda los datos cifrados.
probarContratoDeAlmacen('cifrado sobre memoria', async () => {
  const { claves } = await crearSobre('x', 1_000)
  return crearAlmacenCifrado(crearAlmacenEnMemoria(), claves)
})
