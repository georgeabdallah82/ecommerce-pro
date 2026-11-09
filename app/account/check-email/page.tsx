import type { Metadata } from 'next'
import Link from 'next/link'
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
  return <>
    <main className="section">
      <div className="container" style={{ maxWidth: 560, display: 'grid', gap: 18 }}>
        <div>
          <span className="muted">{t('ACCOUNT')}</span>
          <h1 className="h2">{t('Check your email')}</h1>
          <p className="muted">{t('We sent a link to confirm your address. Open it to finish creating your account. It works for 48 hours.')}</p>
        </div>
        {notice ? <p role="alert" style={{ margin: 0, fontWeight: 700 }}>{notice}</p> : null}
        <ResendVerification />
        <p className="muted" style={{ margin: 0 }}>{t('Already confirmed?')} <Link href="/account/login" style={{ textDecoration: 'underline' }}>{t('Sign in')}</Link></p>
      </div>
    </main>
    <StoreFooter />
  </>
}
