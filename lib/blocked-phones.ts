import { db } from '@/lib/prisma'
import { internationalPhone } from '@/lib/phone'
import { userError } from '@/lib/user-error'

// Phone numbers that may not place orders -- for customers who keep ordering cash on delivery
// and refusing the package. Kept in one setting as a small list; numbers are stored in
// international digits so "70 123 456" and "+961 70 123 456" are the same entry.
export const BLOCKED_PHONES_KEY = 'checkout.blockedPhones'
export const BLOCKED_MESSAGE = "We can't take online orders for this phone number. Please contact us on WhatsApp to place your order."

export type BlockedPhone = { phone: string; note?: string; blockedAt: string }

export function parseBlockedPhones(raw: string | null | undefined): BlockedPhone[] {
  try {
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter(x => x && typeof x.phone === 'string' && x.phone).map(x => ({ phone: String(x.phone), note: x.note ? String(x.note).slice(0, 200) : undefined, blockedAt: String(x.blockedAt || '') })) : []
  } catch { return [] }
}

// True when any of the given numbers (the order's phone, the delivery address phone) is blocked.
export function isBlocked(list: BlockedPhone[], phones: Array<string | null | undefined>, storeCountry?: string | null) {
  if (!list.length) return false
  const blocked = new Set(list.map(x => x.phone))
  return phones.some(phone => { const p = internationalPhone(phone, storeCountry); return !!p && blocked.has(p) })
}

async function storeCountry() {
  return (await db.setting.findUnique({ where: { key: 'store.country' } }).catch(() => null))?.value || 'Lebanon'
}

export async function getBlockedPhones() {
  return parseBlockedPhones((await db.setting.findUnique({ where: { key: BLOCKED_PHONES_KEY } }))?.value)
}

async function save(list: BlockedPhone[]) {
  const value = JSON.stringify(list.slice(0, 2000))
  await db.setting.upsert({ where: { key: BLOCKED_PHONES_KEY }, update: { value }, create: { key: BLOCKED_PHONES_KEY, value } })
}

export async function blockPhone(phone: string, note?: string) {
  const normalized = internationalPhone(phone, await storeCountry())
  if (!normalized) throw userError('Enter a valid phone number')
  const list = await getBlockedPhones()
  if (!list.some(x => x.phone === normalized)) list.unshift({ phone: normalized, note: note?.trim().slice(0, 200) || undefined, blockedAt: new Date().toISOString() })
  await save(list)
  return { phone: normalized, list }
}

export async function unblockPhone(phone: string) {
  const normalized = internationalPhone(phone, await storeCountry()) || phone.replace(/\D/g, '')
  const list = (await getBlockedPhones()).filter(x => x.phone !== normalized)
  await save(list)
  return { phone: normalized, list }
}
