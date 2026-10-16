import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { internationalPhone } from '@/lib/phone'
import { getSellingConfig } from '@/lib/selling-config'

const NO_STORE = { 'Cache-Control': 'no-store' }

// Welcome-discount popup (components/welcome-popup.tsx): saves the shopper's WhatsApp number for
// offers (Admin > Customers > WhatsApp list) and answers with the first-order code. The code
// itself is "first order only" (checked by phone at checkout), so sharing it gains nothing.
export async function POST(req: Request) {
  const limit = await consumeDurableRateLimit(`welcome:${clientIp(req.headers)}`, 10, 60 * 60 * 1000)
  if (!limit.allowed) return json({ error: 'Too many attempts. Please try again later.' }, { status: 429, headers: NO_STORE })
  const selling = await getSellingConfig().catch(() => null)
  if (!selling?.welcome.enabled) return json({ error: 'This offer has ended.' }, { status: 404, headers: NO_STORE })
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const country = (await db.setting.findUnique({ where: { key: 'store.country' } }).catch(() => null))?.value || 'Lebanon'
  const phone = internationalPhone(typeof body?.phone === 'string' ? body.phone.slice(0, 40) : '', country)
  if (!phone) return json({ error: 'This number looks incomplete. Check it, e.g. 70 123 456.' }, { status: 400, headers: NO_STORE })
  const name = typeof body?.name === 'string' ? body.name.replace(/\s+/g, ' ').trim().slice(0, 60) : ''
  await db.phoneSubscriber.upsert({ where: { phone }, update: name ? { name } : {}, create: { phone, name: name || null, source: 'welcome-popup' } })
  return json({ code: selling.welcome.code }, { headers: NO_STORE })
}
