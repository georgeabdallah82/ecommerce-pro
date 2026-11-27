import type { OrderStatus } from '@prisma/client'
import { canTransitionOrder } from '@/lib/orders'

// Shapes the Android admin app's order screens read (app/api/mobile/v1/...). Pure functions only.

// The delivery address a shopper typed, as plain text fields. Unknown or non-text fields are dropped.
export function parseAddress(json: string | null | undefined): Record<string, string> {
  try {
    const value = JSON.parse(String(json || '{}'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const out: Record<string, string> = {}
    for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
      if ((typeof field === 'string' || typeof field === 'number') && String(field).trim() && key.length <= 40) out[key] = String(field).trim().slice(0, 500)
    }
    return out
  } catch { return {} }
}

// Who the order is for: the account's name, else the name on the delivery address, else the email or phone.
export function customerName(order: { user?: { name?: string | null } | null; shippingAddressJson?: string | null; email?: string | null; phone?: string | null }) {
  const address = parseAddress(order.shippingAddressJson)
  const fromAddress = [address.firstName, address.lastName].filter(Boolean).join(' ') || address.name || address.fullName || ''
  return (order.user?.name || fromAddress || order.email || order.phone || 'Guest').trim()
}

const NEXT: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']

// The statuses this order can move to from the app. Refunds have their own workflow on the web
// (app/api/admin/orders refuses REFUNDED here), so the app never offers it.
export function nextStatuses(from: OrderStatus) {
  return NEXT.filter(to => to !== from && canTransitionOrder(from, to))
}
