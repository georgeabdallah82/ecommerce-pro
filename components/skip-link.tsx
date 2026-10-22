'use client'

import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/lang-provider'

// "Skip to content": the first thing a keyboard or screen-reader user reaches, so they do not have
// to tab through the whole header on every page. Invisible until it has focus (storefront-market.css).
// The storefront only: the admin has its own navigation.
export default function SkipLink() {
  const pathname = usePathname() || ''
  const { t } = useI18n()
  if (pathname.startsWith('/admin') || pathname.startsWith('/theme-editor-preview')) return null
  return <a className="skipLink" href="#main-content" onClick={event => {
    const main = document.querySelector('main')
    if (!main) return
    event.preventDefault()
    if (!main.id) main.id = 'main-content'
    main.setAttribute('tabindex', '-1')
    main.focus()
    main.scrollIntoView()
  }}>{t('Skip to content')}</a>
}
