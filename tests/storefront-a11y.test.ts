import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')
const css = read('app/storefront-market.css')

// Found by the storefront UI audit (a real browser at 360 to 1440 px on the local test store).
describe('storefront: keyboard and touch', () => {
  it('draws a solid focus ring on every control, not the 18% see-through one of the older styles', () => {
    assert.match(css, /html body :is\(a, button, input, select, textarea, summary, \[role="button"\], \[role="tab"\]\):focus-visible \{ outline: 3px solid var\(--mk-red/)
    assert.match(read('app/storefront-legacy.css'), /--ux-focus:rgba\(255,90,31,\.18\)/) // why the older ring was not enough
  })

  it('has a "Skip to content" link for keyboard users, on the storefront only, with its Arabic text', () => {
    assert.match(read('app/layout.tsx'), /<CartProvider><SkipLink\/>/)
    const link = read('components/skip-link.tsx')
    assert.match(link, /pathname\.startsWith\('\/admin'\)/)
    assert.match(link, /t\('Skip to content'\)/)
    assert.ok(read('lib/i18n-ar.ts').includes('"Skip to content":'))
    assert.match(css, /\.skipLink \{[^}]*transform: translateY\(-250%\)/)
    assert.match(css, /\.skipLink:focus \{ transform: none/)
  })

  it('makes the controls a thumb has to hit at least 44px (40px inside the dense header bar)', () => {
    for (const rule of [
      /\.focalNavIcon \{ min-width: 44px; min-height: 44px; \}/,
      /\.focalQty button \{ min-width: 44px; min-height: 44px; \}/,
      /\.mkCardWish \{ width: 40px; height: 40px; \}/,
      /\.focalFooter \.footerGrid p > a \{ display: flex; align-items: center; min-height: 44px; \}/,
      /\.mkDots button::after \{ content: ""; position: absolute; inset: -18px -4px; \}/,
    ]) assert.match(css, rule)
  })

  it('every storefront page has one main landmark, home and product included, so the skip link has somewhere to go', () => {
    assert.match(read('components/aliexpress-home.tsx'), /<main className="focalStorefront aliHome">/)
    assert.match(read('app/page.tsx'), /<main>\n\s+\{announcements\.map[\s\S]*<\/main>\n\s+<Footer theme=\{theme\}\/>/) // the page itself: content in main, footer after it
    assert.match(read('components/aliexpress-product.tsx'), /<main className="focalStorefront aliProductPage">/)
    assert.doesNotMatch(read('components/aliexpress-home.tsx') + read('components/aliexpress-product.tsx'), /<div className="focalStorefront ali(Home|ProductPage)">/)
  })

  it('the footer email box can shrink, so the page no longer scrolls sideways on a tablet', () => {
    const footer = read('components/footer.tsx')
    assert.match(footer, /\.focalFooterNewsletterForm input\{flex:1 1 140px;min-width:min\(160px,100%\);/)
    assert.doesNotMatch(footer, /min-width:160px;/)
    // the hidden spam-trap box in that form was the part pushing the page wider: it must not get the 160px minimum
    assert.match(footer, /\.focalFooterNewsletterForm input\[aria-hidden="true"\]\{min-width:0;flex:none\}/)
  })
})

// Found by the owner on the live store (phone): the search button hung over its outline and the
// announcement text sat left of centre. Both came from the first round of touch-target fixes.
describe('storefront: header fits', () => {
  it('keeps the announcement dismiss cross in the corner so it never pushes the text off-centre', () => {
    assert.doesNotMatch(css, /focalAnnouncementDismiss \{ position: relative; \}/)
    assert.match(css, /\.focalAnnouncementGlobal \.focalAnnouncementDismiss \{ position: absolute; inset-inline-end: 12px;/)
    assert.doesNotMatch(css, /focalAnnouncementDismiss \{[^}]*\bright: auto/)
  })
  it('pads the announcement the same on both sides and centres wrapped lines', () => {
    assert.match(css, /focalAnnouncementGlobalInner \{ padding-inline: 42px !important; \}/)
    assert.match(css, /focalAnnouncementGlobalInner > span \{ text-align: center;/)
  })
  it('makes the search bar tall enough for its 40px button plus padding', () => {
    const bar = css.match(/\.aliNavSearchBar \{ height: (\d+)px !important;[^}]*padding: (\d+)px !important;/)
    assert.ok(bar, 'search bar rule found')
    assert.ok(Number(bar![1]) >= 40 + 2 * Number(bar![2]), 'bar is at least button + padding')
    assert.doesNotMatch(css, /aliNavSearchBar \{ height: 44px !important; \}/)
  })
})

describe('storefront: small controls', () => {
  it('gives the cart controls a 44px target and stacks the coupon box on narrow phones', () => {
    assert.match(css, /\.cartPage \.qtyUX button \{ width: 44px; height: 44px; \}/)
    assert.match(css, /\.cartPage \.removeUX \{ min-height: 44px;/)
    assert.match(css, /\.aliCartRowCheckHit \{[^}]*width: 44px; height: 44px;/)
    assert.match(css, /\.aliCouponRow \{ flex-wrap: wrap; \}/)
  })
  it('wraps the cart tick box in a label so the whole 44px square toggles it', () => {
    assert.match(read('components/aliexpress-cart.tsx'), /<label className="aliCartRowCheckHit"><input type="checkbox" className="aliCartRowCheck"/)
  })
})
