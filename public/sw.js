self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'New order received', body: event.data?.text() || '' } }

  const title = data.title || 'New order received'
  const options = {
    body: data.body || 'A new order needs your attention.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.orderId ? `order-${data.orderId}` : 'new-order',
    renotify: true,
    requireInteraction: true,
    data: { url: data.url || '/admin/orders', orderId: data.orderId || null },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/admin/orders'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
