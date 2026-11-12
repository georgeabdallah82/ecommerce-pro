'use client'

import { useEffect } from 'react'

// The store header sticks to the top of the screen (app/storefront-uplift.css). Once the page has
// scrolled it gets a shadow ("focalNavScrolled"). On phones its first row (menu, logo, account,
// cart) tucks away while the shopper scrolls down and comes back as soon as they scroll up
// ("focalNavTucked"), so the search bar stays on screen without the whole header: the same rhythm
// as the WhatsApp button (components/market-chrome.tsx). CSS decides where tucking applies.
export default function StoreNavScroll() {
  useEffect(() => {
    let last = window.scrollY
    let frame = 0
    const update = () => {
      frame = 0
      const nav = document.querySelector<HTMLElement>('.focalNav')
      if (!nav) return
      const y = window.scrollY
      nav.classList.toggle('focalNavScrolled', y > 8)
      if (y > last + 4 && y > nav.offsetHeight + 120) nav.classList.add('focalNavTucked')
      else if (y < last - 4 || y <= nav.offsetHeight) nav.classList.remove('focalNavTucked')
      last = y
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return null
}
