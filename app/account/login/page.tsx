import Link from 'next/link'
import type { Metadata } from 'next'
import { Heart, Package, Zap } from 'lucide-react'
import { StoreFooter } from '@/components/store-footer'
import { login } from './server'
import { safeNextPath } from '@/lib/links'
import { getT } from '@/lib/i18n-server'
import { getThemeState } from '@/lib/theme'
import { firstHeroPhoto } from '@/lib/hero-photo'
import PhoneSignIn from '@/components/phone-sign-in'
import { phoneSignInOffered } from '@/lib/phone-sign-in'

export const metadata: Metadata = { title: 'Sign in' }

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams
  const invalid = params.error === 'invalid'
  const rateLimited = params.error === 'rate-limited'
  const next = safeNextPath(params.next)
  const nextQuery = next === '/account' ? '' : `?next=${encodeURIComponent(next)}`
  // The panel shows the store's own first hero photo. The layout has already read the theme for this request
  // (getThemeState is cached), so this costs nothing; without a photo the panel is the cream band.
  // "Sign in with WhatsApp" once the store has set up the code's template (lib/phone-sign-in.ts).
  const [t, photo, phoneOffered] = await Promise.all([getT(), getThemeState().then(state => firstHeroPhoto(state.sections)).catch(() => null), phoneSignInOffered().catch(() => false)])

  return (
    <><main className="section authPage">
      <div className="container">
        <div className={photo ? 'authShell hasPhoto' : 'authShell'}>
          <div className="authPanel">
            {photo && <img className="authPanelPhoto" src={photo} alt="" loading="lazy" decoding="async" />}
            <div>
              <p className="authPanelTitle">{t('Welcome back')}</p>
              <p className="authPanelLead">{t('Your orders, addresses and wishlist, in one place.')}</p>
              <ul className="authPerks">
                <li><Package size={18} aria-hidden="true" />{t('Track every order')}</li>
                <li><Heart size={18} aria-hidden="true" />{t('Keep your wishlist and addresses')}</li>
                <li><Zap size={18} aria-hidden="true" />{t('Check out faster next time')}</li>
              </ul>
            </div>
          </div>
          <div className="authMain">
            <h1 className="authTitle">{t('Sign in')}</h1>
            <p className="authLead">{t('Access your account to track orders, manage addresses, and more.')}</p>
            {invalid && <div className="alert danger" role="alert">{t('Invalid email or password. Please try again.')}</div>}
            {rateLimited && <div className="alert danger" role="alert">{t('Too many sign-in attempts. Please wait a few minutes and try again.')}</div>}
            <form action={login} className="authForm">
              <input type="hidden" name="next" value={next} />
              <label className="fieldLabel" htmlFor="email">{t('Email')}</label>
              <input className="input" id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
              <div className="authFieldHead">
                <label className="fieldLabel" htmlFor="password">{t('Password')}</label>
                <Link href="/account/forgot-password" className="authForgot">{t('Forgot password?')}</Link>
              </div>
              <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
              <button className="btn authSubmit">{t('Sign in')}</button>
            </form>
            {phoneOffered && <><p className="authDivider">{t('or')}</p><PhoneSignIn next={next} /></>}
            <p className="authDivider">{t('New here?')}</p>
            <Link className="authSecondary" href={`/account/register${nextQuery}`}>{t('Create an account')}</Link>
          </div>
        </div>
      </div>
    </main><StoreFooter /></>
  )
}
