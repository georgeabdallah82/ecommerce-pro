import { markT } from '@/lib/i18n'

// What a customer sees as their order's history (the order page and Track my order): only the
// steps the order went through, in the shop's plain words. Staff notes written on the order
// ("WhatsApp: customer confirmed (recorded by Store Admin)", gateway messages, who cancelled it and
// why) belong to the admin and are never shown here; each step also appears once, however many
// notes were written while the order was in it.

export const CUSTOMER_STEP_LABELS: Record<string, string> = {
  PENDING: markT('Order placed'),
  CONFIRMED: markT('Confirmed'),
  PROCESSING: markT('Preparing'),
  SHIPPED: markT('Out for delivery'),
  DELIVERED: markT('Delivered'),
  CANCELLED: markT('Cancelled'),
  REFUNDED: markT('Refunded'),
}

export function customerTimeline<T extends { status: string; createdAt: Date | string }>(events: T[]): Array<{ status: string; label: string; createdAt: Date }> {
  const seen = new Set<string>()
  const steps: Array<{ status: string; label: string; createdAt: Date }> = []
  const ordered = [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  for (const event of ordered) {
    const label = CUSTOMER_STEP_LABELS[event.status]
    if (!label || seen.has(event.status)) continue
    seen.add(event.status)
    steps.push({ status: event.status, label, createdAt: new Date(event.createdAt) })
  }
  return steps
}
