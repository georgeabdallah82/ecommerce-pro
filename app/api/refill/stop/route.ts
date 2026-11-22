import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { contactKeys, isValidRefillToken, stopRefillReminders, storeCountry } from '@/lib/refill-reminders'

// "Stop these reminders" for "Running low?" reminders (lib/refill-reminders.ts): no more of them to the order's email
// address or phone number. Reached from the button on the reminder's page (a form post) and from mail apps' own
// "Unsubscribe" button (List-Unsubscribe one-click, RFC 8058), both with ?o=<order number>&t=<signature>. Works
// during maintenance.
export async function POST(req: Request) {
  const url = new URL(req.url)
  const orderNumber = (url.searchParams.get('o') || '').slice(0, 60)
  const token = (url.searchParams.get('t') || '').slice(0, 100)
  const fromForm = (req.headers.get('accept') || '').includes('text/html')
  // Relative Location: the visitor stays on the address they came from.
  const page = `/refill/${encodeURIComponent(orderNumber)}?t=${encodeURIComponent(token)}`
  const answer = (ok: boolean) => fromForm
    ? new NextResponse(null, { status: 303, headers: { Location: ok ? `${page}&stopped=1` : page } })
    : NextResponse.json(ok ? { ok: true } : { error: 'This link is not valid' }, { status: ok ? 200 : 400 })
  try {
    const limit = await consumeDurableRateLimit(`refill-stop:${clientIp(req.headers)}`, 20, 10 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts' }, { status: 429 })
    if (!isValidRefillToken(orderNumber, token)) return answer(false)
    const order = await db.order.findUnique({ where: { orderNumber }, select: { email: true, phone: true, shippingAddressJson: true } })
    if (!order) return answer(false)
    await stopRefillReminders(contactKeys(order, await storeCountry()))
    return answer(true)
  } catch (error) {
    console.error('[refill] stop failed', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// A plain visit to the one-click address shows the page, which asks first.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const orderNumber = (url.searchParams.get('o') || '').slice(0, 60)
  const token = (url.searchParams.get('t') || '').slice(0, 100)
  return new NextResponse(null, { status: 303, headers: { Location: `/refill/${encodeURIComponent(orderNumber)}?t=${encodeURIComponent(token)}&stop=1` } })
}
