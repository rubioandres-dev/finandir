/**
 * Versión de AUREM, en semver con etiqueta de pre-release.
 *
 * Vive acá y no en `package.json` porque la lee un componente de cliente:
 * importar el package.json mete todo el manifiesto de dependencias en el
 * bundle. El número se mantiene igual en los dos lados a mano — son dos
 * líneas, y la alternativa es enviarle al navegador la lista completa de
 * dependencias para mostrar un string.
 */
export const VERSION = '0.9.0-dev.5'

/** Etapa del ciclo de vida. Es lo que le dice al usuario qué esperar. */
export const FASE = 'Fase Alpha · Desarrollo activo'

/** A dónde escribir cuando algo se rompe. */
export const CONTACTO_SOPORTE = 'rubioandres.dev@gmail.com'
