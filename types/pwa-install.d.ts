/**
 * La API de instalación de PWA no está en `lib.dom.d.ts` (verificado en
 * TypeScript 5.9.3): `beforeinstallprompt` es una propuesta de la WICG que
 * solo implementan los navegadores Chromium, y `navigator.standalone` es una
 * extensión propietaria de Safari en iOS.
 *
 * Sin imports: el archivo es un script global, no un módulo — igual que
 * speech-recognition.d.ts.
 */

interface BeforeInstallPromptEvent extends Event {
  /** Plataformas donde se puede instalar ('web', 'play', …). */
  readonly platforms: readonly string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  /** Abre el diálogo nativo. Solo vale una vez por evento. */
  prompt(): Promise<void>
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent
  appinstalled: Event
}

interface Navigator {
  /**
   * Safari en iOS: `true` cuando la página corre desde la pantalla de inicio.
   * Es el único indicador confiable en iOS anterior a 16.4, que es cuando
   * Safari incorporó la media query `display-mode`.
   */
  readonly standalone?: boolean
}
