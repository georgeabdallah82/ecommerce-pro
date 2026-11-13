'use client'

import { useEffect, useRef, useState } from 'react'
import { Gift, X } from 'lucide-react'
import { useI18n } from '@/components/lang-provider'
import { useModalFocus } from '@/components/use-modal-focus'

export const INVITE_STORAGE_KEY = 'yh-invite-v1'

// A friend's invite link (yallahaul.com/?invite=MAYA4K7, lib/invites-shared.ts): saves the code for
// checkout -- which applies a saved code by itself -- and says what it gives. The welcome popup
// then stays away (components/welcome-popup.tsx): one first-order offer is enough.
export default function InviteLanding() {
  const { t } = useI18n()
  const [invite, setInvite] = useState<{ code: string; percent: number; name: string } | null>(null)

  useEffect(() => {
    let raw = ''
    try { raw = new URLSearchParams(window.location.search).get('invite') || '' } catch { return }
    if (!raw) return
    // Clean the address so a shared or bookmarked page doesn't carry the code on.
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('invite')
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    } catch {}
    let active = true
    fetch(`/api/invite?code=${encodeURIComponent(raw.slice(0, 20))}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!active || !d?.code) return
        try {
          localStorage.setItem('ecom-coupon-code', String(d.code))
          localStorage.setItem(INVITE_STORAGE_KEY, String(d.code))
        } catch {}
        setInvite({ code: String(d.code), percent: Number(d.percent) || 0, name: String(d.name || '') })
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  // Focus moves to "Start shopping" and stays in the box; Escape closes it (components/use-modal-focus.ts). The box's
  // sentence is read with its title.
  const close = () => setInvite(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocus(dialogRef, !!invite, close)
  if (!invite) return null
  return <div ref={dialogRef} className="welcomePop" role="dialog" aria-modal="true" aria-labelledby="invite-title" aria-describedby="invite-text" tabIndex={-1} onClick={e => { if (e.target === e.currentTarget) close() }}>
    <div className="welcomeCard">
      <button type="button" className="welcomeClose" onClick={close} aria-label={t('Close')}><X size={20} /></button>
      <Gift size={34} aria-hidden="true" style={{ margin: '0 auto', color: 'var(--store-primary, #d7261e)' }} />
      <h2 id="invite-title">{invite.name ? t('{name} invited you!', { name: invite.name }) : t('A friend invited you!')}</h2>
      <p id="invite-text">{t('You get {percent}% off your first order. Your code is saved for checkout.', { percent: invite.percent })}</p>
      <div className="welcomeCode" dir="ltr">{invite.code}</div>
      <button data-autofocus type="button" className="welcomeStart" onClick={close}>{t('Start shopping')}</button>
    </div>
  </div>
}
