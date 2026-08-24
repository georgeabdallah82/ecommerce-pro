'use client'

import { useEffect } from 'react'

export default function StoreNavScroll() {
  useEffect(() => {
    const update = () => {
      const nav = document.querySelector<HTMLElement>('.focalNav')
      if (!nav) return
      nav.classList.toggle('focalNavScrolled', window.scrollY > 8)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return null
}
