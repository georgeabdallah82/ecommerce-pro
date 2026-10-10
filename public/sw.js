self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'New order received', body: event.data?.text() || '' } }

  // Push campaigns to customers (data.marketing) behave like any shop's offer: they show the
  // store's icon, go away by themselves, and a newer offer replaces an unread older one. Staff
  // alerts (new order, review, low stock) stay on screen until someone looks at them.
  const marketing = data.marketing === true
  const title = data.title || (marketing ? 'News from the store' : 'New order received')
  const options = {
    body: data.body || (marketing ? '' : 'A new order needs your attention.'),
    ...(data.icon ? { icon: data.icon, badge: data.icon } : {}),
    tag: data.orderId ? `order-${data.orderId}` : marketing ? 'store-offer' : 'new-order',
    renotify: true,
    requireInteraction: !marketing,
    data: { url: data.url || (marketing ? '/' : '/admin/orders'), orderId: data.orderId || null },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
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
