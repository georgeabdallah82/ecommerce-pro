'use client'

import { useState } from 'react'
import { Check, Gift, Link2, MessageCircle } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'

// "Invite your friends" (thank-you page and the customer's order page): the customer's own code
// (lib/invites.ts), shared on WhatsApp or as a link. The message is written by the page in the
// customer's language.
export default function InviteShare({ code, percent, reward, link, message }: { code: string; percent: number; reward: string; link: string; message: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }).catch(() => {})
  }
  return <section className="inviteCard" aria-labelledby="invite-share-title">
    <div className="inviteHead">
      <span className="inviteIcon" aria-hidden="true"><Gift size={20} /></span>
      <div>
        <h2 id="invite-share-title">{t('Invite your friends')}</h2>
        <p>{reward
          ? t('Your friends get {percent}% off their first order with your code. When their order is delivered, you get {amount} off your next one.', { percent, amount: reward })
          : t('Your friends get {percent}% off their first order with your code.', { percent })}</p>
      </div>
    </div>
    <div className="inviteCode" dir="ltr">{code}</div>
    <div className="inviteActions">
      <a className="inviteWa" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /> {t('Share on WhatsApp')}</a>
      <button type="button" className="inviteCopy" onClick={copy}>{copied ? <Check size={16} /> : <Link2 size={16} />} {copied ? t('Link copied') : t('Copy link')}</button>
    </div>
  </section>
}
