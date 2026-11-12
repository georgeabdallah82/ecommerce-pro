import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// UX uplift, sprint 1 (docs/ux-audit-2026-11.md): a cookie card that stays out of the way, a placeholder with no
// developer text, touch targets of at least 44 px on phones, one main landmark on the shop page, labelled regions,
// and a cart badge drawn by CSS so the button's name ("Cart with N items") is the only name text.

const read = (path: string) => readFileSync(path, 'utf8')

test('the cookie card sits in the corner on desktop and stays compact on phones', () => {
  const css = read('components/cookie-consent.module.css')
  assert.match(css, /max-width: 380px;/)
  assert.match(css, /\.banner \{ left: 24px; right: auto; bottom: 24px; width: 380px; \}/)
  assert.doesNotMatch(css, /max-width: 560px/)
})

test('the cookie banner link and settings button have 44 px targets without moving the text', () => {
  const css = read('components/cookie-consent.module.css')
  assert.match(css, /\.text a \{ color: inherit; text-decoration: underline; display: inline-block; padding-block: 13px; margin-block: -13px; \}/)
  assert.match(css, /\.link \{\n  margin-block: -13px;\n  padding: 13px 0;/)
})

test('the product placeholder shows no developer text', () => {
  const svg = read('public/placeholder-product.svg')
  assert.doesNotMatch(svg, /PRODUCT IMAGE/)
  assert.match(svg, /linearGradient/)
})

test('the announcement dismiss, the shop collections heading and the small captions are fixed', () => {
  const css = read('app/storefront-market.css')
  assert.match(css, /\.focalAnnouncementDismiss::after \{ content: ""; position: absolute; inset: -16px; \}/)
  assert.match(css, /\.aliShopCollections h2 \{ position: absolute; width: 1px; height: 1px;/)
  assert.match(css, /\.mkOfferText small \{ font-size: 12px; \}/)
  assert.match(css, /\.mkSpotText small \{ font-size: 12px; \}/)
  const legacy = read('app/storefront-legacy.css')
  assert.match(legacy, /\.cartPage \.cartInfoUX \.sku\{font-size:12px;/)
  assert.match(legacy, /\.cartPage \.summaryNoteUX\{font-size:12px;/)
  assert.match(legacy, /\.aliCartStickyInfo span\{font-size:12px;/)
})

test('on phones the header search, delivery select, tabs, wishlist, footer form and announcement are at least 44 px', () => {
  const css = read('app/storefront-market.css')
  const start = css.indexOf('@media (max-width: 600px) {\n  html body.mk .focalNav.mkHeader .aliNavSearchBar')
  assert.notEqual(start, -1)
  const phone = css.slice(start, css.indexOf('\n}', start))
  assert.match(phone, /\.aliNavSearchBar \{ height: 54px !important; \}/)
  assert.match(phone, /\.aliNavSearchBar input \{ min-height: 44px !important; \}/)
  assert.match(phone, /\.aliNavSearchSubmit \{ height: auto !important; min-height: 44px !important; align-self: stretch !important; \}/)
  assert.match(phone, /\.focalNavIcon \{ min-width: 44px !important; min-height: 44px !important; \}/)
  assert.match(phone, /\.mkDelivery select \{ min-height: 44px !important; \}/)
  assert.match(phone, /\.mkTabs button \{ min-height: 44px !important; \}/)
  assert.match(phone, /\.mkCardWish \{ width: 44px !important; height: 44px !important; \}/)
  assert.match(phone, /form button\[type="submit"\] \{ min-height: 44px !important; \}/)
  assert.match(phone, /\.focalAnnouncementGlobalInner \{ min-height: 44px !important; \}/)
  assert.match(phone, /\.focalAnnouncementDismiss \{ min-width: 44px !important; min-height: 44px !important; margin: 0 !important; \}/)
})

test('the slide dots keep their look, and each dot has a 44 px button', () => {
  const css = read('app/storefront-market.css')
  assert.match(css, /html body\.mk \.mkDots button \{ width: 44px; height: 44px;/)
  assert.match(css, /html body\.mk \.mkDots button\[aria-current="true"\]::before \{ width: 24px;/)
})

test('the shop page is one main landmark, with its heading first', () => {
  const shop = read('components/aliexpress-shop.tsx')
  const main = shop.indexOf('<main className="focalStorefront aliShopPage">')
  const heading = shop.indexOf('<h1 className="srOnly">')
  assert.ok(main !== -1 && main < heading && heading < shop.indexOf('<aside'), 'the heading sits inside the main landmark, before the sidebar')
  assert.match(shop, /<div className="aliShopMain">/)
  assert.doesNotMatch(shop, /<main className="aliShopMain">/)
  assert.equal((shop.match(/<main\b/g) || []).length, 1)
  assert.equal((shop.match(/<\/main>/g) || []).length, 1)
})

test('the signed-in account link names the visible "Hi, name" text, and product and cart controls reach 44 px', () => {
  const nav = read('components/store-nav-fixed.tsx')
  assert.match(nav, /aria-label=\{shopper \? `\$\{t\('Hi, \{name\}', \{ name: shopper\.firstName \}\)\} \(\$\{t\('My account'\)\}\)` : t\('Account'\)\}/)
  const css = read('app/storefront-market.css')
  for (const selector of ['.pdpZoomOpen { width: 44px; height: 44px; }', '.pdpPromise a { min-height: 44px; }', '.aliReviewSignInBtn { min-height: 44px; }', '.cartPage .qtyUX input { width: 44px; }', 'button[aria-label$="out of 5 stars"] { min-width: 44px; min-height: 44px; }', 'p.muted > a { display: inline-block; padding-block: 13px; margin-block: -13px; }']) {
    assert.ok(css.includes(selector), `missing ${selector}`)
  }
})

test('the cart badge is drawn by CSS, so the button name is the only name text', () => {
  const nav = read('components/store-nav-fixed.tsx')
  assert.equal((nav.match(/className="focalCartCount" aria-hidden="true" data-count=\{/g) || []).length, 2)
  assert.doesNotMatch(nav, /focalCartCount" aria-hidden="true">\{/)
  assert.match(nav, /\.focalCartCount::before\{content:attr\(data-count\)\}/)
  assert.match(nav, /aria-label=\{t\('Cart with \{count\}', \{ count: plural\(count, 'item'\) \}\)\}/)
})

test('the delivery bar is a labelled region, and the shop heading is level 2', () => {
  assert.match(read('components/market-chrome.tsx'), /<div className="mkDelivery" role="region" aria-label=\{t\('Delivery'\)\}>/)
  assert.match(read('components/aliexpress-shop.tsx'), /<h2>\{t\('Collections'\)\}<\/h2>/)
})

test('the newsletter honeypot stays hidden from assistive technology and the keyboard', () => {
  const honeypot = read('components/newsletter-form.tsx').match(/<input type="text" name="company"[\s\S]*?\/>/)?.[0] ?? ''
  assert.notEqual(honeypot, '')
  assert.match(honeypot, /tabIndex=\{-1\}/)
  assert.match(honeypot, /aria-hidden="true"/)
})

test('the avatar initial and the cart count are drawn by CSS, so they stay out of the link and button names', () => {
  const nav = read('components/store-nav-fixed.tsx')
  assert.match(nav, /<span className="navAvatar" aria-hidden="true" data-initial=\{shopper\.initial\} \/>/)
  assert.match(nav, /\.navAvatar::before\{content:attr\(data-initial\)\}/)
})
