import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AR } from '../lib/i18n-ar'

// A real store's settings (docs/store-real-2026-11.md): what showed once the local store had a phone number, the
// WhatsApp button, Arabic, social links, a logo, sizes, a sale price, a sold-out product, reviews and a saved list.

const read = (path: string) => readFileSync(path, 'utf8')

test('the WhatsApp button sits in a landmark and moves out of the way of keyboard focus', () => {
  const chrome = read('components/market-chrome.tsx')
  assert.match(chrome, /<aside className="mkWhatsAppDock" aria-label=\{label \|\| t\('Chat with us on WhatsApp'\)\}>/)
  // Where the button rests (offsetTop and offsetLeft ignore the slide-away transform and the rise) against the focused
  // element. Since docs/store-whatsapp-2026-11.md it first rises above it, and slides away only when there is no room.
  assert.match(chrome, /const left = el\.offsetLeft, top = el\.offsetTop, width = el\.offsetWidth, height = el\.offsetHeight/)
  assert.match(chrome, /if \(focused && focused\.width && covered\(focused\) > 0\) return 'focus'/)
  assert.match(chrome, /document\.addEventListener\('focusin', now\)/)
  assert.match(chrome, /\$\{place\.away === 'focus' \? 'clearOfFocus' : ''\}/)
  const css = read('app/storefront-real.css')
  // At every width: sliding away on scroll is for phones only.
  assert.match(css, /^html body \.mkWhatsApp\.clearOfFocus \{ transform: translateY\(170%\); opacity: 0; pointer-events: none;/m)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ html body \.mkWhatsApp\.clearOfFocus \{ transition: none; \} \}/)
})

test('sizes: a named group, the chosen one says so, 44 px to tap, and a sold-out size that reads', () => {
  const pdp = read('components/aliexpress-product.tsx')
  assert.match(pdp, /<div className="aliProductVariants" role="group" aria-labelledby=\{variantLabelId\}>/)
  assert.match(pdp, /<span id=\{variantLabelId\}>\{optionName && optionName !== 'Title' \? t\(optionName\) : t\('Options'\)\}<\/span>/)
  assert.match(pdp, /<button key=\{v\.id\} type="button" aria-pressed=\{selectedVariantId === v\.id\}/)
  assert.match(pdp, /const optionName = optionKeys\.size === 1 \? \[\.\.\.optionKeys\]\[0\] : ''/)
  for (const name of ['Size', 'Color', 'Colour', 'Options']) assert.ok(AR[name], name)
  const css = read('app/storefront-real.css')
  assert.match(css, /html body \.aliVariantList button \{ min-height: 44px; \}/)
  assert.match(css, /html body \.aliVariantList button\.soldOut \{ color: #6b7280; \}/)
})

test('touch targets and small text the real settings showed', () => {
  const css = read('app/storefront-real.css')
  assert.match(css, /html body \.shopFilterChip \{ min-height: 44px; \}/)
  assert.match(css, /html body \.focalStorefront \.focalBadge \{ font-size: 12px !important; \}/)
  assert.match(css, /html body\.mk \.noticeCard small \{ font-size: 12\.5px; \}/)
  const checkout = read('app/checkout/checkout.module.css')
  assert.match(checkout, /\.linkBtn \{ justify-self: start; min-height: 44px;/)
  assert.match(checkout, /\.qty \{[^}]*font-size: 12px;/)
})

test('the footer logo can be read, and a saved list has its heading level', () => {
  const css = read('app/storefront-real.css')
  assert.match(css, /html body \.focalFooter \.footerLogoCard \{ max-height: 46px; \}/)
  assert.match(css, /@media \(max-width: 700px\) \{ html body \.focalFooter \.footerLogoCard \{ max-height: 42px; \} \}/)
  assert.match(read('components/wishlist-grid.tsx'), /<h2 className="srOnly">\{t\('Products'\)\}<\/h2>\n\s+<div className="aliDenseGrid">/)
})

test('the real-store styles load last', () => {
  const layout = read('app/layout.tsx')
  assert.ok(layout.indexOf("import './storefront-real.css'") > layout.indexOf("import './storefront-links.css'"))
})
