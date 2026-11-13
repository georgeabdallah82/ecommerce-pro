import type { Metadata } from 'next'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { StoreFooter } from '@/components/store-footer'
import ResendVerification from '@/components/resend-verification'
import { getT } from '@/lib/i18n-server'

export const metadata: Metadata = { title: 'Check your email' }
export const dynamic = 'force-dynamic'

// After sign-up, and when an account still needs its email confirmed. The same page for every sign-up.
export default async function CheckEmail({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const t = await getT()
  const { error } = await searchParams
  const notice = error === 'expired' ? t('That link has expired or was already used. Send a new one below.')
    : error === 'unverified' ? t('Confirm your email first. Open the link we sent you, or send it again below.')
    : error === 'rate-limited' ? t('Too many attempts. Please wait a little and try again.')
    : ''
  // The sign-in page's card, on its own (app/storefront-account.css: .authShell.isSolo).
  return <>
    <main className="section authPage">
      <div className="container">
        <div className="authShell isSolo">
          <div className="authMain">
            <span className="authBadge" aria-hidden="true"><MailCheck size={22} /></span>
            <h1 className="authTitle">{t('Check your email')}</h1>
            <p className="authLead">{t('We sent a link to confirm your address. Open it to finish creating your account. It works for 48 hours.')}</p>
            {notice ? <div className="alert danger" role="alert">{notice}</div> : null}
            <ResendVerification />
            <p className="authDivider">{t('Already confirmed?')}</p>
            <Link className="authSecondary" href="/account/login">{t('Sign in')}</Link>
          </div>
        </div>
      </div>
    </main>
    <StoreFooter />
  </>
}
