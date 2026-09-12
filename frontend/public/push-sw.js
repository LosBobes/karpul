/* Push notifications inside the generated service worker (see vite.config.ts:
   `importScripts` pulls this file into sw.js). The payload is the JSON the
   backend encrypts in app/push.py: title, body, url, tag. A tap opens the
   ride, in a window the app already has if there is one. */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Karpul', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Karpul'
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
