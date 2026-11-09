import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { clientIp } from '@/lib/request-ip'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/email'
import { runInBackground } from '@/lib/background'
import { cleanWholesaleInput, wholesaleEmail, type WholesaleInput } from '@/lib/wholesale'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// The wholesale / bulk-order form (/wholesale). Five inquiries an hour from one address; the
// inquiry is saved first, then the store's contact address is told (a failed email never loses it).
export async function POST(req: Request) {
  try {
    const limit = await consumeDurableRateLimit(`wholesale:${clientIp(req.headers)}`, 5, 60 * 60 * 1000)
    if (!limit.allowed) return json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: NO_STORE })
    const parsed = cleanWholesaleInput(await req.json().catch(() => null))
    if ('error' in parsed) return json({ error: parsed.error }, { status: 400, headers: NO_STORE })
    const data = parsed.data
    const inquiry = await db.wholesaleInquiry.create({
      data: { ...data, city: data.city || null, interest: data.interest || null, message: data.message || null },
      select: { id: true },
    })
    runInBackground(notifyContact(data))
    return json({ ok: true, id: inquiry.id }, { status: 201, headers: NO_STORE })
  } catch (error) {
    console.error('[wholesale] failure', error)
    return json({ error: 'Unable to send your request. Please try again or message us on WhatsApp.' }, { status: 500, headers: NO_STORE })
  }
}

async function notifyContact(input: WholesaleInput) {
  try {
    const row = await db.setting.findUnique({ where: { key: 'contact.email' }, select: { value: true } })
    const to = (row?.value || '').trim()
    if (!to) return
    const mail = wholesaleEmail(input)
    await sendEmail(to, mail.subject, mail.html, mail.text)
  } catch (error) {
    console.error('[wholesale] could not email the contact address', error)
  }
}
