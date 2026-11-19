'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/lang-provider'
import { TrackingScripts } from '@/components/tracking-scripts'
import type { TrackingConfig } from '@/lib/tracking'
import styles from './cookie-consent.module.css'

// Consent for the ad pixels (Meta, Google, TikTok). Nothing from them loads until the shopper
// accepts. The choice is kept on this device; the footer's "Cookie settings" reopens it.
// Declining after accepting reloads the page, because scripts already loaded stay loaded until then.

const KEY = 'cookieConsent'
const CHANGED = 'cookie-consent:change'
export const COOKIE_SETTINGS_EVENT = 'cookie-consent:open'

type Choice = 'granted' | 'denied'

// The shopper's answer, for the checkout request: the order keeps it, and the server's Purchase event follows it.
export function adConsentChoice(): Choice | null { return readChoice() }

function readChoice(): Choice | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

function saveChoice(choice: Choice) {
  try { localStorage.setItem(KEY, choice) } catch {}
}

// Loads the ad pixels only after the shopper has accepted.
export function ConsentTracking({ config, nonce }: { config: TrackingConfig; nonce?: string }) {
  const [choice, setChoice] = useState<Choice | null>(null)
  useEffect(() => {
    setChoice(readChoice())
    const update = () => setChoice(readChoice())
    window.addEventListener(CHANGED, update)
    return () => window.removeEventListener(CHANGED, update)
  }, [])
  if (choice !== 'granted') return null
  return <TrackingScripts config={config} nonce={nonce} />
}

// The banner: shown until the shopper chooses, and again from "Cookie settings". Not in the admin.
export function CookieBanner() {
  const pathname = usePathname() || ''
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setOpen(readChoice() === null)
    const reopen = () => setOpen(true)
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen)
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen)
  }, [])

  // While the banner is up, the space it takes from the bottom of the screen is published as
  // --cookie-banner-height. A sticky action bar (checkout's Place order) uses it to sit above the banner.
  const bannerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = bannerRef.current
    if (!open || !element) {
      document.documentElement.style.removeProperty('--cookie-banner-height')
      return
    }
    const publish = () => document.documentElement.style.setProperty('--cookie-banner-height', `${element.offsetHeight + 12}px`)
    publish()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
    observer?.observe(element)
    window.addEventListener('resize', publish)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', publish)
      document.documentElement.style.removeProperty('--cookie-banner-height')
    }
  }, [open, pathname])

  if (!open || pathname.startsWith('/admin')) return null

  const answer = (choice: Choice) => {
    const before = readChoice()
    saveChoice(choice)
    setOpen(false)
    if (choice === 'denied' && before === 'granted') {
      window.location.reload()
      return
    }
    window.dispatchEvent(new Event(CHANGED))
  }

  return <div ref={bannerRef} role="region" aria-label={t('Cookies')} className={styles.banner}>
    <p className={styles.text}>
      {t('We use cookies to measure visits and to show you relevant ads on Facebook, Instagram, Google and TikTok.')}{' '}
      <Link href="/privacy-policy">{t('Privacy policy')}</Link>
    </p>
    <div className={styles.actions}>
      <button type="button" className={styles.decline} onClick={() => answer('denied')}>{t('Decline')}</button>
      <button type="button" className={styles.accept} onClick={() => answer('granted')}>{t('Accept')}</button>
    </div>
  </div>
}

// For the footer: reopens the choice.
export function CookieSettingsButton() {
  const { t } = useI18n()
  return <button type="button" className={styles.link} onClick={() => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT))}>{t('Cookie settings')}</button>
}
