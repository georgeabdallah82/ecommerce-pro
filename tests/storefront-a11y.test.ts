import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Storefront accessibility review (docs/storefront-checkout-audit-2026-11.md, backlog): the skip link is the first
// keyboard stop, and the announcement bar is a labelled region, so the page content sits inside landmarks.

const read = (path: string) => readFileSync(path, 'utf8')

test('the skip link is the first keyboard stop, before the cookie banner', () => {
  const layout = read('app/layout.tsx')
  assert.doesNotMatch(layout, /<body[^>]*><CookieBanner \/>/)
  assert.match(layout, /<CartProvider><SkipLink\/><CookieBanner \/><NavProgress\/>/)
})

test('the skip link has a target that exists on page load, so it resolves without JavaScript', () => {
  assert.match(read('app/layout.tsx'), /<StoreNavScroll\/><span id="main-content" tabIndex=\{-1\}/)
  assert.doesNotMatch(read('components/skip-link.tsx'), /main\.id = 'main-content'/)
})

test('the announcement bar is a labelled region, with its Arabic label', () => {
  assert.match(read('components/store-nav-fixed.tsx'), /<div className="focalAnnouncementGlobal" role="region" aria-label=\{t\('Announcement'\)\}>/)
  assert.match(read('lib/i18n-ar.ts'), /"Announcement": "الإعلان"/)
})
