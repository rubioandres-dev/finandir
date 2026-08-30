/**
 * Modo privado: los importes se muestran enmascarados.
 *
 * PARA QUÉ
 *
 * Abrir la app en un colectivo, pasarle el teléfono a alguien para que mire
 * una foto, compartir pantalla en una reunión. El saldo no tiene por qué estar
 * a la vista todo el tiempo, y taparlo no debería costar más que un toque.
 *
 * POR QUÉ DOS COOKIES Y NO UNA
 *
 * Son dos cosas distintas, y mezclarlas rompe la que el usuario pidió:
 *
 *   - `COOKIE_PRIVACIDAD` es la PREFERENCIA: cómo tiene que arrancar la app.
 *     Se elige en Ajustes y dura un año.
 *   - `COOKIE_PRIVACIDAD_SESION` es el OJITO: un override temporal. Va sin
 *     `max-age`, así que es una cookie de sesión y muere con ella. Es lo que
 *     hace que destapar los importes un rato no cambie con qué arranca la app
 *     la próxima vez.
 *
 * Con una sola cookie, el ojito pisaría la preferencia y "por defecto" pasaría
 * a significar "lo último que tocaste".
 *
 * POR QUÉ COOKIES Y NO localStorage
 *
 * El mismo motivo que en `currency-mode.ts`: media app son Server Components
 * que formatean los importes en el servidor. Con una cookie el servidor ya
 * manda el HTML enmascarado; con localStorage el importe viajaría en claro y
 * se taparía después, con un parpadeo que es justo lo que no se quiere en una
 * función de privacidad.
 *
 * ESTE MÓDULO NO PUEDE IMPORTAR `next/headers`: lo importa el provider, que es
 * cliente. La lectura vive en `currency-mode-server.ts`.
 */

export const COOKIE_PRIVACIDAD = 'aurem:privado'
export const COOKIE_PRIVACIDAD_SESION = 'aurem:privado-sesion'

/** Un año: es una preferencia, no una sesión. */
export const MAX_EDAD_COOKIE_PRIVACIDAD = 60 * 60 * 24 * 365

/** Lo que se ve en lugar de un importe tapado. */
export const MASCARA_DE_MONTO = '••••'

/**
 * ¿Arranca tapado?
 *
 * El override de sesión gana si existe; si no, manda la preferencia. Y por
 * defecto los importes se ven: quien no configuró nada no debería encontrarse
 * una app llena de puntitos sin saber por qué.
 */
export function estaOculto(
  preferencia: string | undefined | null,
  sesion: string | undefined | null
): boolean {
  if (sesion === '1') return true
  if (sesion === '0') return false
  return preferencia === '1'
}
