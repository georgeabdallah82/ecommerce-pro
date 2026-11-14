import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The WhatsApp button at rest (docs/store-whatsapp-2026-11.md): it no longer rests on a link, button or field, and the
// end of the page leaves room for it.

const read = (path: string) => readFileSync(path, 'utf8')
const chrome = read('components/market-chrome.tsx')
const css = read('app/storefront-whatsapp.css')

test('at rest it never covers a link, button or field, only the corner of a large one', () => {
  assert.match(chrome, /const CONTROL = 'a\[href\], button, input:not\(\[type="hidden"\]\), select, textarea, summary, label, \[role="button"\]'/)
  // What is on top at six points across its column, edge to edge, every 8 px down, so a product card's photo counts as
  // the card's link and a card peeking in at the edge of a row is seen.
  assert.match(chrome, /for \(let y = top - highest \+ 4; y < top \+ height; y \+= 8\) \{\n\s+for \(let x = left \+ 2; x <= right - 2; x \+= \(width - 4\) \/ 5\) \{/)
  assert.match(chrome, /const hit = document\.elementsFromPoint\(x, y\)\.find\(node => !node\.closest\('\.mkWhatsAppDock'\)\)/)
  // Large: at least two and a half times its size each way (a product card, an offer tile). Their middle stays clear.
  assert.match(chrome, /const large = box\.width >= width \* 2\.5 && box\.height >= height \* 2\.5/)
  assert.match(chrome, /if \(large \? x > left && x < right && y > t && y < bottom : covered\(box\) > 16\) return 'room'/)
})

test('it rises above what is under it, up to twice its height, and slides away only when there is no room', () => {
  assert.match(chrome, /const highest = height \* 2, right = left \+ width/)
  assert.match(chrome, /for \(let lift = 8; lift <= highest; lift \+= 8\) if \(!hides\(top - lift\)\) return \{ lift, away: '' \}/)
  assert.match(chrome, /return \{ lift: 0, away: atRest \}/)
  assert.match(chrome, /style=\{place\.lift \? \{ '--wa-lift': `\$\{place\.lift\}px` \} as React\.CSSProperties : undefined\}/)
  assert.match(chrome, /\$\{place\.away === 'room' \? 'noRoom' : ''\}/)
  assert.match(css, /html body \.mkWhatsApp \{ translate: 0 calc\(-1 \* var\(--wa-lift, 0px\)\); \}/)
  assert.match(css, /html body \.mkWhatsApp\.noRoom \{ transform: translateY\(170%\); opacity: 0; pointer-events: none; \}/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ html body\.mk \.mkWhatsApp \{ transition: none; \} \}/)
})

test('it is placed again whenever the page comes to rest, focus moves, after a click, when something stops moving and on a new page', () => {
  for (const line of ["document.addEventListener('focusin', now)", "document.addEventListener('focusout', now)", "document.addEventListener('click', afterClick)", "window.addEventListener('scroll', onScroll, { passive: true })", "window.addEventListener('resize', atRest)", "window.addEventListener('load', atRest)", "document.addEventListener('transitionend', atRest)", "document.addEventListener('animationend', atRest)"]) {
    assert.ok(chrome.includes(line), line)
  }
  assert.match(chrome, /\}, \[enabled, store, pathname\]\)/)
  // While scrolling, the focused element under the button moves it at once (focus scrolled into view smoothly).
  assert.match(chrome, /if \(r\.width && r\.left < b\.right && r\.right > b\.left && r\.top < b\.bottom && r\.bottom > b\.top\) update\(\)/)
  // On phones it still slides away while the shopper scrolls down (tests/phone-polish.test.ts).
  assert.match(chrome, /if \(y > last \+ 4 && y > 240\) setTucked\(true\)/)
})

test('the end of the page leaves room for it, on phones only when it shows there', () => {
  assert.match(css, /@media \(min-width: 760px\) \{\n\s+html body\.mk:has\(\.mkWhatsApp\) footer\.focalFooter \{ padding-bottom: calc\(86px \+ env\(safe-area-inset-bottom, 0px\)\) !important; \}/)
  assert.match(css, /@media \(max-width: 759px\) \{\n\s+html body\.mk:has\(\.mkWhatsApp:not\(\.desktopOnly\)\) footer\.focalFooter \{ padding-bottom: calc\(78px \+ env\(safe-area-inset-bottom, 0px\)\) !important; \}/)
  // 86 = 56 px button + 18 px from the edge + 12 px; 78 = 52 + 14 + 12 (app/storefront-market.css).
  const market = read('app/storefront-market.css')
  assert.match(market, /\.mkWhatsApp \{ position: fixed; z-index: 70; bottom: calc\(18px \+ env\(safe-area-inset-bottom, 0px\)\);[^}]*height: 56px;/)
  assert.match(market, /\.mkWhatsApp \{ height: 52px; min-width: 52px; bottom: calc\(14px \+ env\(safe-area-inset-bottom, 0px\)\); \}/)
})

test('on a phone\'s cart it sits above the checkout bar, and the page leaves room for both', () => {
  assert.match(css, /@media \(max-width: 700px\) \{\n\s+html body:has\(\.aliCartStickyBar\) \.mkWhatsApp \{ bottom: calc\(86px \+ env\(safe-area-inset-bottom, 0px\)\); \}/)
  assert.match(css, /html body\.mk:has\(\.aliCartStickyBar\) footer\.focalFooter \{ padding-bottom: calc\(85px \+ env\(safe-area-inset-bottom, 0px\)\) !important; \}/)
  assert.match(css, /html body\.mk:has\(\.aliCartStickyBar\):has\(\.mkWhatsApp:not\(\.desktopOnly\)\) footer\.focalFooter \{ padding-bottom: calc\(150px \+ env\(safe-area-inset-bottom, 0px\)\) !important; \}/)
  // The bar is fixed to the bottom on phones up to 700 px, like the product page's buy bar the button already clears.
  assert.match(read('app/storefront-legacy.css'), /@media\(max-width:700px\)\{\n\s+\.aliCartPage\{padding-bottom:76px\}[\s\S]*?\.aliCartStickyBar\{position:fixed;bottom:0;/)
  assert.match(read('app/storefront-market.css'), /body:has\(\.focalStickyBuyBar\) \.mkWhatsApp, body:has\(\.aliStickyBar\) \.mkWhatsApp \{ bottom: calc\(86px \+ env\(safe-area-inset-bottom, 0px\)\); \}/)
})

test('the WhatsApp styles load last', () => {
  const layout = read('app/layout.tsx')
  assert.ok(layout.indexOf("import './storefront-whatsapp.css'") > layout.indexOf("import './storefront-cards.css'"))
})
