'use client'

import { useEffect } from 'react'

// Market homepage: sections rise into view as the shopper scrolls to them (app/storefront-motion.css).
// Only what starts below the first screen is held back, so nothing already on screen ever blinks.
// Visitors who ask for less motion, and browsers without IntersectionObserver, see everything as
// it is. Blocks (section headings, the spotlight banner) rise on their own; groups (product rows,
// offers, departments, the trust strip) bring their items in one after another.
//
// IntersectionObserver rather than CSS scroll-driven animations: the store sets overflow-x: hidden
// on <body>, which makes the body the nearest scroll container, and view() timelines never move.
export const REVEAL_BLOCKS = '.mkHead, .mkSpotBanner, .aliSectionHead'
export const REVEAL_GROUPS = '.mkGrid, .mkSpotGrid, .mkOffers, .aliCategoryRow, .aliTrustRow, .aliDenseGrid'

export default function ScrollReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const home = document.querySelector('.aliHome')
    if (!home) return
    const fold = window.innerHeight
    const held: Element[] = []
    const hold = (el: Element, kind: string) => {
      // Not displayed at this width, or already (even partly) on screen: leave it alone.
      if (!el.getClientRects().length || el.getBoundingClientRect().top < fold) return
      el.classList.add(kind)
      held.push(el)
    }
    home.querySelectorAll(REVEAL_BLOCKS).forEach(el => hold(el, 'rvlSelf'))
    home.querySelectorAll(REVEAL_GROUPS).forEach(el => hold(el, 'rvlKids'))
    if (!held.length) return
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('isIn')
        io.unobserve(entry.target)
      }
    }, { rootMargin: '0px 0px -8% 0px' })
    held.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
  return null
}
