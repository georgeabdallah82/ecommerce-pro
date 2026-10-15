'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Share, Smartphone, SquarePlus, X } from 'lucide-react'
import styles from './install-app.module.css'
import { useI18n } from '@/components/lang-provider'

// "Get the app" in the phone menu: puts the store on the home screen (app/manifest.ts). Android
// and desktop Chrome offer their own install prompt, which this opens; iPhones have none, so it
// shows the two taps Safari needs. Hidden when the store is already open as the app, and on
// browsers that can't do either.

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let installPrompt: InstallPrompt | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  // Chrome fires this once it considers the store installable, usually soon after the page loads.
  window.addEventListener('beforeinstallprompt', event => { installPrompt = event as InstallPrompt; listeners.forEach(fn => fn()) })
  window.addEventListener('appinstalled', () => { installPrompt = null; listeners.forEach(fn => fn()) })
}

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
// Instagram, Facebook and TikTok open links in their own browser, which can't add to the home screen.
const isInAppBrowser = () => /FBAN|FBAV|Instagram|musical_ly|Bytedance|TikTok/i.test(navigator.userAgent)

export function InstallAppRow({ storeName, onDone }: { storeName: string; onDone?: () => void }) {
  const [mode, setMode] = useState<'none' | 'prompt' | 'ios'>('none')
  const [help, setHelp] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    const update = () => setMode(isStandalone() ? 'none' : installPrompt ? 'prompt' : isIos() ? 'ios' : 'none')
    update()
    listeners.add(update)
    return () => { listeners.delete(update) }
  }, [])

  async function install() {
    if (mode === 'ios' || !installPrompt) { setHelp(true); return }
    const prompt = installPrompt
    await prompt.prompt().catch(() => undefined)
    await prompt.userChoice.catch(() => undefined)
    // The browser allows each prompt once.
    installPrompt = null
    listeners.forEach(fn => fn())
    onDone?.()
  }

  if (mode === 'none') return null
  return (
    <>
      <li>
        <button type="button" className="mkMenuRow" onClick={install}><Smartphone size={17} /><span>{t('Get the {name} app', { name: storeName })}</span><ChevronRight size={16} /></button>
      </li>
      {help && typeof document !== 'undefined' && createPortal(
        <div className={styles.overlay} onClick={() => setHelp(false)}>
          <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="install-app-title" onClick={e => e.stopPropagation()}>
            <button type="button" className={styles.close} onClick={() => setHelp(false)} aria-label={t('Close')}><X size={18} /></button>
            <strong id="install-app-title">{t('Add {name} to your home screen', { name: storeName })}</strong>
            {isInAppBrowser() ? (
              <p>{t('Open this page in Safari first: tap ⋯ and choose Open in browser. Then follow the two steps below.')}</p>
            ) : (
              <p>{t('It opens like an app, and you can get our offers and order updates as notifications.')}</p>
            )}
            <ol className={styles.steps}>
              <li><span className={styles.stepIcon}><Share size={18} /></span><span>{t('Tap the Share button at the bottom of Safari')}</span></li>
              <li><span className={styles.stepIcon}><SquarePlus size={18} /></span><span>{t('Scroll down and tap Add to Home Screen, then Add')}</span></li>
            </ol>
            <button type="button" className={styles.ok} onClick={() => setHelp(false)}>{t('Got it')}</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
