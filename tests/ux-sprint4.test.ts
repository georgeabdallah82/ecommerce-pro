import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { AR } from '../lib/i18n-ar'

// UX sprint 4: the category strip, the cart's checkboxes, the sign-in page, the not-found page and the Best Sellers
// minimum. Source checks, the same way sprints 1 to 3 are checked.

const read = (path: string) => readFileSync(path, 'utf8')

test('the sprint 4 stylesheet is imported last, after the selling styles', () => {
  const layout = read('app/layout.tsx')
  const sprint4 = layout.indexOf("import './storefront-sprint4.css'")
  assert.notEqual(sprint4, -1, 'the stylesheet is imported')
  assert.ok(sprint4 > layout.indexOf("import './storefront-selling.css'"), 'it comes after the selling styles')
})

test('the category strip is one row of tiles and keeps a visible focus ring for keyboard users', () => {
  const css = read('app/storefront-sprint4.css')
  assert.match(css, /html body\.mk \.aliCategoryRow \{ display: grid !important; grid-auto-flow: column !important;/)
  assert.match(css, /html body\.mk \.aliCategoryItem:focus-visible \.aliCategoryIcon \{ transform: translateY\(-3px\); box-shadow: 0 0 0 2px var\(--mk-ink\) !important; \}/)
})

test('cart checkboxes are drawn inside 44 px touch targets, and the real input stays focusable', () => {
  const css = read('app/storefront-sprint4.css')
  assert.match(css, /html body\.mk \.aliCartRowCheckHit \{ position: relative; display: grid; place-items: center; width: 44px; height: 44px;/)
  assert.match(css, /html body\.mk \.aliCartCheck \{ position: relative; display: inline-flex; align-items: center; gap: 10px; min-height: 44px;/)
  // The real checkbox is transparent and covers the whole target: it still takes focus and clicks.
  assert.match(css, /html body\.mk \.aliCartRowCheckHit > input \{ position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0;/)
  assert.match(css, /html body\.mk \.aliCartCheck > input \{ position: absolute; inset-inline-start: 0; top: 0; width: 44px; height: 44px; margin: 0; opacity: 0;/)
  const cart = read('components/aliexpress-cart.tsx')
  assert.match(cart, /className="aliCartRowCheck"/)
  assert.match(cart, /aria-label=\{t\('Select all items'\)\}/)
})

test('sign-in keeps its fields, errors and links, and its brand panel is a plain container, not a second landmark', () => {
  const page = read('app/account/login/page.tsx')
  assert.match(page, /<div className="authPanel">/)
  assert.doesNotMatch(page, /<aside/, 'an aside inside main is a nested complementary landmark')
  assert.match(page, /<input className="input" id="email" name="email" type="email"/)
  assert.match(page, /<input className="input" id="password" name="password" type="password"/)
  assert.match(page, /href="\/account\/forgot-password"/)
  assert.match(page, /\{invalid && <div className="alert danger"/)
  assert.match(page, /\{rateLimited && <div className="alert danger"/)
  assert.match(read('app/storefront-sprint4.css'), /html body\.mk \.authPanel \{ display: none; \}/)
})

test('the not-found page searches the shop and links only to pages that exist', () => {
  const page = read('app/not-found.tsx')
  assert.match(page, /<form action="\/shop" method="GET" role="search"/)
  assert.match(page, /<input type="search" name="q"/)
  assert.match(page, /href="\/shop\?sort=newest"/)
  assert.match(page, /href="\/orders\/lookup"/)
  assert.match(page, /href="\/"/)
  for (const route of ['app/shop/page.tsx', 'app/orders/lookup/page.tsx', 'app/page.tsx']) {
    assert.ok(existsSync(route), `${route} exists`)
  }
  assert.match(read('app/shop/page.tsx'), /newest/, 'the shop still sorts by newest')
})

test('Best Sellers shows a row only once four products can fill it', () => {
  const sections = read('components/storefront-sections.tsx')
  assert.match(sections, /if\(sold\.length<4\)\{const gap=bestSellersGap\(usingSold,sold\.length,newArrivals\.length\)/)
  assert.doesNotMatch(sections, /if\(!sold\.length\)return preview\?<EmptySectionNotice key=\{section\.id\} id=\{section\.id\} name="Best sellers"/)
})

test('every new sign-in and not-found string has an Arabic translation', () => {
  const dict = AR as Record<string, string | undefined>
  for (const key of [
    'Welcome back',
    'Your orders, addresses and wishlist, in one place.',
    'Track every order',
    'Keep your wishlist and addresses',
    'Check out faster next time',
    'Try a search, or start from one of these.',
  ]) {
    assert.ok(dict[key], `Arabic entry for "${key}"`)
    assert.notEqual(dict[key], key, `"${key}" is translated, not copied`)
  }
})
