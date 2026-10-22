import { internationalPhone } from '@/lib/phone'

// "Rewards by phone number" (Admin > Marketing > Rewards): a customer who reaches every N delivered
// orders earns a one-use thank-you code, which staff send on WhatsApp with one tap. Most customers
// order without an account, so a customer is a phone number (the same number however it was typed).
// The rules that need no database; the database side is lib/rewards.ts.

export const REWARDS_SETTING = 'rewards.config'
export const REWARD_CODE_PREFIX = 'LOYAL'
export const LIMITS = { everyOrders: [2, 50], percent: [1, 50], days: [7, 365] } as const

export type RewardsConfig = { enabled: boolean; everyOrders: number; percent: number; days: number }
export const REWARDS_DEFAULTS: RewardsConfig = { enabled: false, everyOrders: 5, percent: 10, days: 60 }

const whole = (value: unknown) => {
  const n = typeof value === 'string' ? Number(value.trim()) : Number(value)
  return Number.isFinite(n) && Number.isInteger(n) ? n : NaN
}
const inRange = (n: number, [min, max]: readonly [number, number]) => n >= min && n <= max

// What is stored, read leniently: anything unusable falls back to the default.
export function normalizeRewardsConfig(raw: unknown): RewardsConfig {
  let value: Record<string, unknown> = {}
  try { const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; if (parsed && typeof parsed === 'object') value = parsed as Record<string, unknown> } catch {}
  const pick = (key: 'everyOrders' | 'percent' | 'days') => { const n = whole(value[key]); return inRange(n, LIMITS[key]) ? n : REWARDS_DEFAULTS[key] }
  return { enabled: value.enabled === true, everyOrders: pick('everyOrders'), percent: pick('percent'), days: pick('days') }
}

// What the owner typed, checked. `error` is a plain sentence for the owner.
export function validateRewardsConfig(raw: unknown): { ok: true; value: RewardsConfig } | { ok: false; error: string } {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const everyOrders = whole(body.everyOrders), percent = whole(body.percent), days = whole(body.days)
  if (!inRange(everyOrders, LIMITS.everyOrders)) return { ok: false, error: `Orders needed must be a whole number from ${LIMITS.everyOrders[0]} to ${LIMITS.everyOrders[1]}.` }
  if (!inRange(percent, LIMITS.percent)) return { ok: false, error: `The discount must be a whole number from ${LIMITS.percent[0]} to ${LIMITS.percent[1]} percent.` }
  if (!inRange(days, LIMITS.days)) return { ok: false, error: `The code must stay valid for ${LIMITS.days[0]} to ${LIMITS.days[1]} days.` }
  return { ok: true, value: { enabled: body.enabled === true, everyOrders, percent, days } }
}

export type RewardOrder = { status: string; createdAt: Date | string; phone: string | null; shippingAddressJson: string | null }
export type RewardCustomer = { phone: string; name: string; delivered: number; earned: number; given: number; due: number; nextMilestone: number; lastDeliveredAt: string }

function nameOf(json: string | null) {
  try { const a = JSON.parse(json || '{}') || {}; return `${String(a.firstName || '').trim()} ${String(a.lastName || '').trim()}`.trim() } catch { return '' }
}

// How many rewards a customer has earned in total: one for every N delivered orders.
export const rewardsEarned = (delivered: number, everyOrders: number) => (everyOrders >= 1 ? Math.floor(Math.max(0, delivered) / everyOrders) : 0)

// Customers who earned a reward that was not made yet, the ones with the most delivered orders first.
// Only delivered orders count (not cancelled, refused or still on the way). `given` is how many codes
// were already made for each phone number; `blocked` are numbers the store refuses.
export function rewardCustomers(orders: RewardOrder[], given: Map<string, number>, config: Pick<RewardsConfig, 'everyOrders'>, options: { storeCountry: string; blocked?: Set<string> }): RewardCustomer[] {
  const groups = new Map<string, RewardOrder[]>()
  for (const order of orders) {
    if (order.status !== 'DELIVERED') continue
    let phone = internationalPhone(order.phone, options.storeCountry)
    if (!phone) { try { phone = internationalPhone(String(JSON.parse(order.shippingAddressJson || '{}')?.phone || ''), options.storeCountry) } catch {} }
    if (!phone || options.blocked?.has(phone)) continue
    const list = groups.get(phone)
    if (list) list.push(order); else groups.set(phone, [order])
  }
  const out: RewardCustomer[] = []
  for (const [phone, list] of groups) {
    const earned = rewardsEarned(list.length, config.everyOrders)
    const already = given.get(phone) || 0
    if (earned <= already) continue
    const newest = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    out.push({ phone, name: newest.map(o => nameOf(o.shippingAddressJson)).find(Boolean) || '', delivered: list.length, earned, given: already, due: earned - already, nextMilestone: already + 1, lastDeliveredAt: new Date(newest[0].createdAt).toISOString() })
  }
  return out.sort((a, b) => b.delivered - a.delivered || a.phone.localeCompare(b.phone))
}

// The WhatsApp message (English, like the other admin messages; staff can edit it in WhatsApp).
export function rewardMessage(input: { storeName: string; name: string; code: string; percent: number; days: number; delivered: number; siteUrl: string }) {
  const first = input.name.split(/\s+/)[0] || ''
  return [
    `Hi${first ? ` ${first}` : ''}! Thank you for ordering from ${input.storeName || 'our store'} again and again.${input.delivered > 0 ? ` You have had ${input.delivered} orders with us, so here is a little thank-you.` : ' Here is a little thank-you.'}`,
    '',
    `Use code ${input.code} at checkout for ${input.percent}% off your next order. It works once and stays valid for ${input.days} days.`,
    '',
    input.siteUrl,
  ].join('\n')
}

export type CodeState = 'unused' | 'used' | 'expired' | 'off'
export function codeState(coupon: { usedCount: number; expiresAt: Date | string | null; isActive: boolean } | null | undefined, now = new Date()): CodeState {
  if (!coupon || !coupon.isActive) return 'off'
  if (coupon.usedCount > 0) return 'used'
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now.getTime()) return 'expired'
  return 'unused'
}
