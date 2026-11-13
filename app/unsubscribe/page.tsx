import Link from 'next/link'
import { Link2Off, MailCheck, MailX } from 'lucide-react'
import { StoreFooter } from '@/components/store-footer'
import { isValidUnsubscribeToken } from '@/lib/cart-reminders'
import { getT } from '@/lib/i18n-server'
// The order confirmation's cards (app/order/success), like the store's other pages reached from a link it sends.
import s from '@/app/order/success/success.module.css'

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
  const tr = await getT()
  const back = <Link className={done || !valid ? `${s.btn} ${s.btnPrimary}` : s.btn} href="/">{tr('Back to the store')}</Link>
  return <>
    <main className={s.page}><div className={s.wrap}><section className={`${s.card} ${s.hero}`}>
      {done ? <>
        <span className={s.tick} aria-hidden="true"><MailCheck size={32} /></span>
        <h1 className={s.title}>{tr("You're unsubscribed")}</h1>
        <p className={s.lead}>{tr("We won't send you cart reminder emails again. Emails about your orders still arrive as usual.")}</p>
      </> : valid ? <>
        <span className={`${s.tick} linkBadge`} aria-hidden="true"><MailX size={32} /></span>
        <h1 className={s.title}>{tr('Stop cart reminder emails?')}</h1>
        <p className={s.lead}>{tr('We sometimes email you when you leave items in your cart. Order confirmations and delivery updates are not affected.')}</p>
      </> : <>
        <span className={`${s.tick} ${s.tickWarn}`} aria-hidden="true"><Link2Off size={32} /></span>
        <h1 className={s.title}>{tr('This link has expired or is not valid')}</h1>
        <p className={s.lead}>{tr("Reply to any of our emails and we'll stop the reminders for you.")}</p>
      </>}
      {valid ? <div className={`${s.actions} linkActions`}>
        <form method="post" action={`/api/unsubscribe?c=${encodeURIComponent(checkoutId)}&t=${encodeURIComponent(token)}`}>
          <button className={`${s.btn} ${s.btnPrimary} linkSubmit`} type="submit">{tr('Yes, stop these emails')}</button>
        </form>
        {back}
      </div> : <div className="linkActions">{back}</div>}
    </section></div></main>
    <StoreFooter />
  </>
}
