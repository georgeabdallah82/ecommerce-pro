import Link from 'next/link'
import type { Metadata } from 'next'
import { Heart, Package, Zap } from 'lucide-react'
import { StoreFooter } from '@/components/store-footer'
import { register } from './server'
import { safeNextPath } from '@/lib/links'
import { getT } from '@/lib/i18n-server'
import { getThemeState } from '@/lib/theme'
import { firstHeroPhoto } from '@/lib/hero-photo'

export const metadata: Metadata = { title: 'Create account' }

// The same card as the sign-in page (app/account/login/page.tsx): on computers the store's own first hero photo, with
// what an account is for, beside the form. Every field has a visible label (they were placeholders only, which go away
// as soon as you type), and the browser is told what each field is, so it can fill in the name and email and offer a
// strong password.
export default async function Register({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams
  const next = safeNextPath(sp.next)
  const [t, photo] = await Promise.all([getT(), getThemeState().then(state => firstHeroPhoto(state.sections)).catch(() => null)])
  const signIn = next === '/account' ? '/account/login' : `/account/login?next=${encodeURIComponent(next)}`

  return (
    <><main className="section authPage">
      <div className="container">
        <div className={photo ? 'authShell hasPhoto' : 'authShell'}>
          <div className="authPanel">
            {photo && <img className="authPanelPhoto" src={photo} alt="" loading="lazy" decoding="async" />}
            <div>
              <p className="authPanelTitle">{t('Welcome')}</p>
              <p className="authPanelLead">{t('Your orders, addresses and wishlist, in one place.')}</p>
              <ul className="authPerks">
                <li><Package size={18} aria-hidden="true" />{t('Track every order')}</li>
                <li><Heart size={18} aria-hidden="true" />{t('Keep your wishlist and addresses')}</li>
                <li><Zap size={18} aria-hidden="true" />{t('Check out faster next time')}</li>
              </ul>
            </div>
          </div>
          <div className="authMain">
            <h1 className="authTitle">{t('Create account')}</h1>
            <p className="authLead">{t('It takes a minute. We send you a link to confirm your email.')}</p>
            {sp.error === 'invalid' && <div className="alert danger" role="alert">{t('Please enter a valid name, email and password of at least 8 characters.')}</div>}
            {sp.error === 'exists' && <div className="alert danger" role="alert">{t('An account with this email already exists.')}</div>}
            {sp.error === 'rate-limited' && <div className="alert danger" role="alert">{t('Too many registration attempts. Please wait a while and try again.')}</div>}
            <form action={register} className="authForm">
              <input type="hidden" name="next" value={next} />
              <label className="fieldLabel" htmlFor="name">{t('Full name')}</label>
              <input className="input" id="name" name="name" autoComplete="name" required minLength={2} />
              <label className="fieldLabel" htmlFor="email">{t('Email')}</label>
              <input className="input" id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
              <label className="fieldLabel" htmlFor="password">{t('Password')}</label>
              <input className="input" id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} aria-describedby="password-hint" />
              <p className="authHint" id="password-hint">{t('At least 8 characters.')}</p>
              <button className="btn authSubmit">{t('Create account')}</button>
            </form>
            <p className="authDivider">{t('Already have an account?')}</p>
            <Link className="authSecondary" href={signIn}>{t('Sign in')}</Link>
          </div>
        </div>
      </div>
    </main><StoreFooter /></>
  )
}
