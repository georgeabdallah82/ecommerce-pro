// Cancel an order without an account: on the thank-you page and Track my order, for a short
// time after ordering and only until the owner confirms it (Settings > Selling tools).

export const GUEST_CANCEL_ENABLED_KEY = 'orders.guestCancel.enabled'
export const GUEST_CANCEL_MINUTES_KEY = 'orders.guestCancel.minutes'
export const DEFAULT_GUEST_CANCEL_MINUTES = 30
export const MIN_GUEST_CANCEL_MINUTES = 5
export const MAX_GUEST_CANCEL_MINUTES = 240

export type GuestCancelConfig = { enabled: boolean; minutes: number }

// On unless the owner switched it off; 30 minutes unless set (kept between 5 and 240).
export function guestCancelConfig(settings: Record<string, string | undefined> | Map<string, string>): GuestCancelConfig {
  const read = (key: string) => (settings instanceof Map ? settings.get(key) : settings[key]) ?? ''
  const asked = Math.round(parseFloat(read(GUEST_CANCEL_MINUTES_KEY)))
  const minutes = Number.isFinite(asked) && asked > 0 ? Math.min(MAX_GUEST_CANCEL_MINUTES, Math.max(MIN_GUEST_CANCEL_MINUTES, asked)) : DEFAULT_GUEST_CANCEL_MINUTES
  return { enabled: read(GUEST_CANCEL_ENABLED_KEY) !== 'false', minutes }
}

export type GuestCancelRefusal = 'off' | 'status' | 'paid' | 'late'
export type GuestCancelState = { allowed: true; deadline: Date; secondsLeft: number } | { allowed: false; reason: GuestCancelRefusal }

// Only a new order (PENDING: not confirmed yet), not paid online, inside the time limit.
export function guestCancelState(order: { status: string; paymentStatus: string; createdAt: Date | string }, config: GuestCancelConfig, now: Date = new Date()): GuestCancelState {
  if (!config.enabled) return { allowed: false, reason: 'off' }
  if (order.status !== 'PENDING') return { allowed: false, reason: 'status' }
  if (order.paymentStatus === 'PAID' || order.paymentStatus === 'PARTIALLY_REFUNDED') return { allowed: false, reason: 'paid' }
  const deadline = new Date(new Date(order.createdAt).getTime() + config.minutes * 60 * 1000)
  const secondsLeft = Math.floor((deadline.getTime() - now.getTime()) / 1000)
  if (!(secondsLeft > 0)) return { allowed: false, reason: 'late' }
  return { allowed: true, deadline, secondsLeft }
}

// What the customer is told, by reason. These go through the storefront translations (t()).
export const GUEST_CANCEL_MESSAGES: Record<GuestCancelRefusal, string> = {
  off: 'Cancelling online is not available. Please contact us on WhatsApp.',
  status: 'We already started working on this order. Please contact us on WhatsApp to change it.',
  paid: 'This order was paid online, so it cannot be cancelled here. Please contact us.',
  late: 'The time to cancel online has passed. Please contact us on WhatsApp.',
}
