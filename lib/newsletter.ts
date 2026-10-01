import { db } from '@/lib/prisma'

// Newsletter subscribers are kept as one Setting row per address (the same
// key-prefix pattern lib/push.ts uses for push subscriptions) rather than as
// customer accounts: a User needs a password, and creating a half-account for
// every email-only visitor would make "this email is already registered" block
// that person's later real sign-up. Like Shopify, subscribing never requires
// -- or creates -- an account; an existing customer with the same address just
// gets tagged so they show up in Customers/Segments.
const PREFIX = 'newsletter.subscriber.'
export const NEWSLETTER_TAG = 'Newsletter subscriber'

export type Subscriber = { email: string; subscribedAt: string; source: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null
  return email
}

const keyFor = (email: string) => PREFIX + email

function parse(value: string): Subscriber | null {
  try {
    const saved = JSON.parse(value)
    const email = normalizeEmail(saved?.email)
    if (!email) return null
    return { email, subscribedAt: String(saved.subscribedAt || ''), source: String(saved.source || 'storefront') }
  } catch { return null }
}

// Best-effort: tag the matching customer account, if there is one. A failure
// here must never turn a successful subscription into an error for the visitor.
async function tagExistingCustomer(email: string) {
  try {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true } })
    if (!user || user.role !== 'CUSTOMER') return
    const tag = await db.customerTag.upsert({ where: { value: NEWSLETTER_TAG }, update: {}, create: { value: NEWSLETTER_TAG } })
    await db.customerTagMember.upsert({ where: { tagId_customerId: { tagId: tag.id, customerId: user.id } }, update: {}, create: { tagId: tag.id, customerId: user.id } })
  } catch { /* ignore */ }
}

// Idempotent: subscribing an address that is already subscribed is a no-op that
// reports created=false, so a double submit (or someone re-entering their
// address) never produces a duplicate row or an error.
export async function subscribeToNewsletter(email: string, source = 'storefront') {
  const key = keyFor(email)
  const existing = await db.setting.findUnique({ where: { key } })
  if (existing) return { created: false }
  const value = JSON.stringify({ email, subscribedAt: new Date().toISOString(), source: source.slice(0, 40) })
  await db.setting.upsert({ where: { key }, update: {}, create: { key, value } })
  await tagExistingCustomer(email)
  return { created: true }
}

export async function listSubscribers(): Promise<Subscriber[]> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: PREFIX } }, select: { value: true } })
  return rows
    .map((row: { value: string }) => parse(row.value))
    .filter((row: Subscriber | null): row is Subscriber => row !== null)
    .sort((a: Subscriber, b: Subscriber) => b.subscribedAt.localeCompare(a.subscribedAt))
}

export async function removeSubscriber(email: string) {
  await db.setting.deleteMany({ where: { key: keyFor(email) } })
}

// Spreadsheet apps execute cells that start with = + - @ -- the address and source
// come from the public, so neutralise them in exports.
const csvCell = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}
export function subscribersToCsv(rows: Subscriber[]) {
  return ['Email,Subscribed at,Source', ...rows.map(row => [csvCell(row.email), csvCell(row.subscribedAt), csvCell(row.source)].join(','))].join('\n')
}
