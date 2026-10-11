import { sameApplicationServerKey, urlBase64ToUint8Array } from '@/lib/push-opt-in'

// Browser side of web push, shared by the storefront's notification popup
// (components/push-opt-in.tsx) and "Notify me when it's back" (components/back-in-stock-button.tsx).

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// Asks for permission if needed and returns this browser's push subscription for the store's key
// (an existing one is reused, so the admin's order alerts on the same device keep working).
// null when the customer said no.
export async function subscribeThisBrowser(vapidPublicKey: string): Promise<PushSubscription | null> {
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') return null
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  const key = urlBase64ToUint8Array(vapidPublicKey)
  let subscription = await registration.pushManager.getSubscription()
  if (subscription && !sameApplicationServerKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe().catch(() => undefined)
    subscription = null
  }
  return subscription || registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource })
}
