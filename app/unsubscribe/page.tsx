import Link from 'next/link'
import { StoreFooter } from '@/components/store-footer'
import { isValidUnsubscribeToken } from '@/lib/cart-reminders'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Email preferences', robots: { index: false, follow: false } }

// Linked from cart reminder emails. Asks before unsubscribing: mail scanners open every link in
// an email, and must not unsubscribe anyone by doing so. The button posts to /api/unsubscribe.
export default async function Unsubscribe({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''
  const checkoutId = one(params.c).slice(0, 100)
  const token = one(params.t).slice(0, 100)
  const done = one(params.done) === '1'
  const valid = !done && isValidUnsubscribeToken(checkoutId, token)
  return <>
    <main className="section"><div className="container"><div className="card empty">
      {done ? <>
        <h1 className="h2">You&apos;re unsubscribed</h1>
        <p className="muted">We won&apos;t send you cart reminder emails again. Emails about your orders still arrive as usual.</p>
      </> : valid ? <>
        <h1 className="h2">Stop cart reminder emails?</h1>
        <p className="muted">We sometimes email you when you leave items in your cart. Order confirmations and delivery updates are not affected.</p>
        <form method="post" action={`/api/unsubscribe?c=${encodeURIComponent(checkoutId)}&t=${encodeURIComponent(token)}`}>
          <button className="btn" type="submit">Yes, stop these emails</button>
        </form>
      </> : <>
        <h1 className="h2">This link has expired or is not valid</h1>
        <p className="muted">Reply to any of our emails and we&apos;ll stop the reminders for you.</p>
      </>}
      <div className="inline" style={{ justifyContent: 'center', marginTop: 12 }}><Link className="btn secondary" href="/">Back to the store</Link></div>
    </div></div></main>
    <StoreFooter />
  </>
}
