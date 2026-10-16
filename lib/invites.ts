import { randomInt } from 'node:crypto'
import { db } from '@/lib/prisma'
import { internationalPhone } from '@/lib/phone'
import { orderedBefore } from '@/lib/customer-history'
import { getSellingConfig } from '@/lib/selling-config'
import { getStoreIdentity } from '@/lib/store-identity'
import { siteUrl } from '@/lib/seo'
import { money } from '@/lib/config'
import { cleanInviteCode, inviteLink, inviteShareMessage, makeInviteCode, randomPart } from '@/lib/invites-shared'

// "Invite a friend", the database side (the rules are in lib/invites-shared.ts).

const secureRandom = () => randomInt(0, 1_000_000) / 1_000_000

// The customer's own code: the one already made for this phone number, or a new one. Returns ''
// when the phone number can't be read.
export async function inviteCodeFor(phone: string | null | undefined, name: string | null | undefined, storeCountry: string) {
  const digits = internationalPhone(phone, storeCountry)
  if (!digits) return ''
  const existing = await db.inviteCode.findUnique({ where: { phone: digits }, select: { code: true } })
  if (existing) return existing.code
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeInviteCode(name, secureRandom)
    // A discount code with the same name always wins at checkout, so never hand that one out.
    if (await db.coupon.findUnique({ where: { code }, select: { id: true } })) continue
    try {
      return (await db.inviteCode.create({ data: { code, phone: digits, name: String(name || '').trim().slice(0, 60) || null }, select: { code: true } })).code
    } catch (error) {
      if (!(error instanceof Error && /unique/i.test(error.message))) throw error
      // Made at the same moment by another page for this phone, or the code is taken: look again.
      const now = await db.inviteCode.findUnique({ where: { phone: digits }, select: { code: true } })
      if (now) return now.code
    }
  }
  return ''
}

export type InviteCoupon = {
  id: null; code: string; type: 'PERCENTAGE'; value: number; isActive: true; isAutomatic: false
  minSubtotal: null; maxUses: null; usedCount: 0; startsAt: null; expiresAt: null
  appliesTo: 'ALL_PRODUCTS'; productIds: string[]; collectionIds: string[]
  buyQuantity: null; getQuantity: null; getDiscountPercent: null; firstOrderOnly: false
  invite: { phone: string; name: string | null }
}

// A typed code that isn't a discount from Discounts may be a customer's invite code: then it
// works like a first-order percentage discount (checked by checkInvite below). Never counted or
// limited like a discount code -- any number of friends can use it, once each.
export async function inviteCoupon(raw: string): Promise<InviteCoupon | null> {
  const code = cleanInviteCode(raw)
  if (!code) return null
  const [row, config] = await Promise.all([
    db.inviteCode.findUnique({ where: { code } }),
    getSellingConfig().then(c => c.invite).catch(() => null),
  ])
  if (!row || !config?.enabled) return null
  return {
    id: null, code: row.code, type: 'PERCENTAGE', value: config.friendPercent, isActive: true, isAutomatic: false,
    minSubtotal: null, maxUses: null, usedCount: 0, startsAt: null, expiresAt: null,
    appliesTo: 'ALL_PRODUCTS', productIds: [], collectionIds: [],
    buyQuantity: null, getQuantity: null, getDiscountPercent: null, firstOrderOnly: false,
    invite: { phone: row.phone, name: row.name },
  }
}

// For new customers only, and not for the inviter themselves. Throws the message checkout shows.
export async function checkInvite(invite: { phone: string }, buyer: { phone?: string | null; email?: string | null; userId?: string | null }, storeCountry: string) {
  const phone = internationalPhone(buyer.phone, storeCountry)
  if (phone && phone === invite.phone) throw new Error('This is your own invite code. Share it with your friends.')
  if (buyer.userId && await db.order.findFirst({ where: { userId: buyer.userId, status: { not: 'CANCELLED' } }, select: { id: true } })) throw new Error('This coupon is for first orders only')
  if (await orderedBefore(buyer.phone, buyer.email, storeCountry)) throw new Error('This coupon is for first orders only')
}

export type RewardResult = { rewardCode: string; inviterPhone: string; inviterName: string; friendName: string; amount: number; expiresAt: Date }

// The inviter's thank-you code for a friend's delivered order: a one-use discount in Discounts
// (so it is used, limited and restored on cancellation like any other code). Once per order.
export async function createInviteReward(orderId: string): Promise<RewardResult> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true, status: true, couponCode: true, shippingAddressJson: true, inviteReward: true } })
  if (!order) throw new Error('Order not found')
  if (order.inviteReward) throw new Error('A thank-you code was already made for this order')
  if (order.status !== 'DELIVERED') throw new Error('The friend\'s order must be delivered first')
  const invite = order.couponCode ? await db.inviteCode.findUnique({ where: { code: order.couponCode.toUpperCase() } }) : null
  if (!invite) throw new Error('This order did not use an invite code')
  const config = (await getSellingConfig()).invite
  if (!config.reward) throw new Error('Set the thank-you amount first (Settings > Selling tools)')

  const expiresAt = new Date(Date.now() + config.rewardDays * 24 * 60 * 60 * 1000)
  for (let attempt = 0; attempt < 6; attempt++) {
    const rewardCode = `THANKS${randomPart(5, secureRandom)}`
    if (await db.coupon.findUnique({ where: { code: rewardCode }, select: { id: true } })) continue
    // The reward row first: its order id allows one per order, even if staff tap twice.
    try {
      await db.inviteReward.create({ data: { orderId: order.id, inviteCode: invite.code, rewardCode } })
    } catch (error) {
      if (error instanceof Error && /unique/i.test(error.message) && await db.inviteReward.findUnique({ where: { orderId: order.id } })) throw new Error('A thank-you code was already made for this order')
      if (error instanceof Error && /unique/i.test(error.message)) continue
      throw error
    }
    try {
      await db.coupon.create({ data: { code: rewardCode, type: 'FIXED', value: config.reward, maxUses: 1, expiresAt, isActive: true } })
    } catch (error) {
      await db.inviteReward.delete({ where: { orderId: order.id } }).catch(() => {})
      throw error
    }
    let friendName = ''
    try { friendName = String(JSON.parse(order.shippingAddressJson || '{}')?.firstName || '').trim() } catch {}
    return { rewardCode, inviterPhone: invite.phone, inviterName: String(invite.name || '').trim().split(/\s+/)[0] || '', friendName, amount: config.reward, expiresAt }
  }
  throw new Error('Could not make a thank-you code, please try again')
}

type Translate = (text: string, vars?: Record<string, string | number>) => string

// The "Invite your friends" card for a customer's order (thank-you page, order page): their code,
// what friends and they get, and the WhatsApp message in the page's language. Null when invites
// are off or the order has no usable phone number.
export async function inviteCardFor(order: { phone: string | null; shippingAddressJson: string | null; currency: string }, t: Translate) {
  const config = await getSellingConfig().then(c => c.invite).catch(() => null)
  if (!config?.enabled) return null
  const store = await getStoreIdentity().catch(() => ({ name: '', country: 'Lebanon' }))
  let address: Record<string, unknown> = {}
  try { address = JSON.parse(order.shippingAddressJson || '{}') || {} } catch {}
  const name = `${String(address.firstName || '').trim()} ${String(address.lastName || '').trim()}`.trim()
  const code = await inviteCodeFor(order.phone || String(address.phone || ''), name, store.country).catch(() => '')
  if (!code) return null
  const link = inviteLink(siteUrl(), code)
  return {
    code,
    percent: config.friendPercent,
    reward: config.reward ? money(config.reward, order.currency) : '',
    link,
    message: inviteShareMessage({ storeName: store.name, code, percent: config.friendPercent, link }, t),
  }
}
