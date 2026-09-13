/**
 * Tests de "buscar o crear".
 *
 * Antes del port esto pedia un cliente de Supabase y el caso concurrente se
 * manejaba atrapando un 23505 a mano. Ahora el reintento es el lazo generico de
 * `mutar()`, y los dos tests de carrera son los que demuestran que la decision
 * tomada ADENTRO de la mutacion es lo que evita el duplicado.
 */

import { describe, expect, it } from 'vitest'
import { crearLibro } from './almacen/libro'
import { crearAlmacenEnMemoria } from './almacen/memoria'
import type { CategoriaGuardada, CuentaGuardada } from './almacen/documentos'
import { obtenerOCrearCategoria, obtenerOCrearCuenta } from './finanzas'

function cuenta(p: Partial<CuentaGuardada>): CuentaGuardada {
  return {
    id: crypto.randomUUID(), user_id: 'u1', name: 'Cuenta', type: 'BANK',
    currency: 'ARS', is_liquid: true, created_at: '2025-01-01T00:00:00Z',
    detalle: null, ...p,
  }
}

function categoria(p: Partial<CategoriaGuardada>): CategoriaGuardada {
  return {
    id: crypto.randomUUID(), user_id: 'u1', name: 'Comida', type: 'EXPENSE',
    icon: 'circle', color: '#64748B', presupuestos: [], ...p,
  }
}

describe('obtener o crear cuenta', () => {
  it('la crea cuando no hay ninguna en esa moneda', async () => {
    const libro = crearLibro(crearAlmacenEnMemoria())

    const { cuentaId } = await obtenerOCrearCuenta(libro, 'u1', 'USD')

    const cuentas = await libro.leer('cuentas')
    expect(cuentas).toHaveLength(1)
    expect(cuentas[0].id).toBe(cuentaId)
    expect(cuentas[0].currency).toBe('USD')
  })

  it('devuelve la que ya hay, sin crear otra', async () => {
    const libro = crearLibro(crearAlmacenEnMemoria())
    await libro.mutar('cuentas', () => [cuenta({ id: 'vieja', currency: 'ARS' })])

    const { cuentaId } = await obtenerOCrearCuenta(libro, 'u1', 'ARS')

    expect(cuentaId).toBe('vieja')
    expect(await libro.leer('cuentas')).toHaveLength(1)
  })

  it('NUNCA elige una tarjeta de credito', async () => {
    // Mandar un gasto ahi sin que nadie lo pida genera deuda en silencio, que
    // es el peor default posible.
    const libro = crearLibro(crearAlmacenEnMemoria())
    await libro.mutar('cuentas', () => [
      cuenta({ id: 'tarjeta', type: 'CREDIT_CARD', is_liquid: false }),
    ])

    const { cuentaId } = await obtenerOCrearCuenta(libro, 'u1', 'ARS')

    expect(cuentaId).not.toBe('tarjeta')
    expect(await libro.leer('cuentas')).toHaveLength(2)
  })

  it('prefiere la liquida, y a igualdad la mas vieja', async () => {
    const libro = crearLibro(crearAlmacenEnMemoria())
    await libro.mutar('cuentas', () => [
      cuenta({ id: 'nueva', created_at: '2026-01-01T00:00:00Z' }),
      cuenta({ id: 'inversion', is_liquid: false, created_at: '2024-01-01T00:00:00Z' }),
      cuenta({ id: 'vieja', created_at: '2025-01-01T00:00:00Z' }),
    ])

    const { cuentaId } = await obtenerOCrearCuenta(libro, 'u1', 'ARS')
    expect(cuentaId).toBe('vieja')
  })

  it('si otro dispositivo la crea en el medio, NO se duplica', async () => {
    // Este es el reemplazo del `if (errorInsert.code === '23505')` que habia
    // que atrapar a mano. Ahora lo resuelve el lazo de reintentos, porque la
    // busqueda pasa ADENTRO de la mutacion.
    let inyectado = false
    const almacen = crearAlmacenEnMemoria({
      antesDeGuardar: () => {
        if (inyectado) return
        inyectado = true
        almacen.sembrar('cuentas', [cuenta({ id: 'del-otro', currency: 'EUR' })])
      },
    })
    const libro = crearLibro(almacen)

    const { cuentaId } = await obtenerOCrearCuenta(libro, 'u1', 'EUR')

    expect(cuentaId).toBe('del-otro')
    expect(await libro.leer('cuentas')).toHaveLength(1)
  })
})

describe('obtener o crear categoria', () => {
  it('un nombre vacio no crea nada', async () => {
    const libro = crearLibro(crearAlmacenEnMemoria())
    const { categoriaId } = await obtenerOCrearCategoria(libro, 'u1', '   ', 'EXPENSE')
    expect(categoriaId).toBeNull()
  })

  it('la crea y la reusa', async () => {
    const libro = crearLibro(crearAlmacenEnMemoria())

    const a = await obtenerOCrearCategoria(libro, 'u1', 'Delivery', 'EXPENSE')
    const b = await obtenerOCrearCategoria(libro, 'u1', 'delivery', 'EXPENSE')

    expect(b.categoriaId).toBe(a.categoriaId)
    expect(await libro.leer('categorias')).toHaveLength(1)
  })

  it('el mismo nombre en INCOME y EXPENSE son dos categorias', async () => {
    const libro = crearLibro(crearAlmacenEnMemoria())
    const gasto = await obtenerOCrearCategoria(libro, 'u1', 'Viajes', 'EXPENSE')
    const ingreso = await obtenerOCrearCategoria(libro, 'u1', 'Viajes', 'INCOME')

    expect(ingreso.categoriaId).not.toBe(gasto.categoriaId)
    expect(await libro.leer('categorias')).toHaveLength(2)
  })

  it('gana la PROPIA sobre la global', async () => {
    // Desde migrations/008 hay categorias globales con `user_id` nulo. Si
    // alguien se armo su "Comida", es a la que quiere imputar.
    const libro = crearLibro(crearAlmacenEnMemoria())
    await libro.mutar('categorias', () => [
      categoria({ id: 'global', user_id: null as unknown as string }),
      categoria({ id: 'mia', user_id: 'u1' }),
    ])

    const { categoriaId } = await obtenerOCrearCategoria(libro, 'u1', 'Comida', 'EXPENSE')
    expect(categoriaId).toBe('mia')
  })

  it('si otro dispositivo la crea en el medio, NO se duplica', async () => {
    let inyectado = false
    const almacen = crearAlmacenEnMemoria({
      antesDeGuardar: () => {
        if (inyectado) return
        inyectado = true
        almacen.sembrar('categorias', [categoria({ id: 'del-otro', name: 'Nafta' })])
      },
    })
    const libro = crearLibro(almacen)

    const { categoriaId } = await obtenerOCrearCategoria(libro, 'u1', 'Nafta', 'EXPENSE')

    expect(categoriaId).toBe('del-otro')
    expect(await libro.leer('categorias')).toHaveLength(1)
  })
})
