import { NextResponse } from 'next/server'
import { db } from '@/lib/prisma'
import { consumeDurableRateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/request-ip'
import { isValidUnsubscribeToken, optOutEmail } from '@/lib/cart-reminders'

// Stops cart reminder emails for the address a reminder was sent to. Reached from the button on
// /unsubscribe (a form post) and from mail apps' own "Unsubscribe" button (List-Unsubscribe
// one-click, RFC 8058), both with ?c=<checkout>&t=<signature>. Works during maintenance.
export async function POST(req: Request) {
  const url = new URL(req.url)
  const checkoutId = (url.searchParams.get('c') || '').slice(0, 100)
  const token = url.searchParams.get('t') || ''
  const fromForm = (req.headers.get('accept') || '').includes('text/html')
  // Relative Location: the visitor stays on the address they came from.
  const answer = (ok: boolean) => fromForm
    ? new NextResponse(null, { status: 303, headers: { Location: `/unsubscribe?${ok ? 'done=1' : 'invalid=1'}` } })
    : NextResponse.json(ok ? { ok: true } : { error: 'This link is not valid' }, { status: ok ? 200 : 400 })
  try {
    const limit = await consumeDurableRateLimit(`unsubscribe:${clientIp(req.headers)}`, 20, 10 * 60 * 1000)
    if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts' }, { status: 429 })
    if (!isValidUnsubscribeToken(checkoutId, token)) return answer(false)
    const checkout = await db.abandonedCheckout.findUnique({ where: { id: checkoutId }, select: { email: true } })
    if (!checkout?.email) return answer(false)
    await optOutEmail(checkout.email)
    return answer(true)
  } catch (error) {
    console.error('[unsubscribe] failed', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// A plain visit to the one-click address shows the page with its button instead.
export async function GET(req: Request) {
  return new NextResponse(null, { status: 303, headers: { Location: `/unsubscribe${new URL(req.url).search}` } })
}
