/**
 * Worker propio de AUREM.
 *
 * `@ducanh2912/next-pwa` busca solo este archivo (`worker/index.js`), lo
 * compila aparte y lo importa desde el `sw.js` que genera. No hay que
 * registrarlo ni configurarlo: alcanza con que exista.
 *
 * POR QUÉ EXISTE
 *
 * Está únicamente por el aviso del escáner de comprobantes. Sin un manejador
 * de `notificationclick`, tocar la notificación en Android la cierra y no hace
 * nada más: el usuario queda mirando la pantalla de inicio con el comprobante
 * leído esperándolo adentro de una app que no se abrió.
 *
 * Se traen al frente las ventanas que ya estén abiertas en vez de abrir una
 * nueva porque el estado del escaneo vive en memoria de esa pestaña: abrir una
 * ventana nueva la dejaría sin el comprobante. El modal lo reabre el propio
 * dashboard al detectar que volvió a estar visible.
 */
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()

  const destino = new URL(evento.notification.data?.url ?? '/dashboard', self.location.origin)

  evento.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((ventanas) => {
        const abierta = ventanas.find((ventana) => new URL(ventana.url).origin === destino.origin)

        // `focus()` puede fallar si el sistema no le da permiso al SW; ahí se
        // cae a abrir una ventana, que es peor pero no deja al usuario sin nada.
        if (abierta && 'focus' in abierta) return abierta.focus()

        return self.clients.openWindow(destino.href)
      })
      .catch(() => self.clients.openWindow(destino.href))
  )
})
