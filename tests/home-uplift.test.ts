import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fontCssStack } from '../lib/font-options'

// Homepage pass (docs/home-uplift-2026-11.md): the header wordmark's font, the spotlight's kicker and "Shop all" tile,
// a "Shop all" link on the New arrivals row, the trust strip's spacing and the 760-1023 px tablet tier.

const read = (path: string) => readFileSync(path, 'utf8')

test('the header wordmark gets a real font stack, not the theme font key', () => {
  const nav = read('components/store-nav-fixed.tsx')
  assert.match(nav, /className="focalLogo" style=\{\{ fontFamily: fontCssStack\(theme\.typography\.heading\) \}\}/)
  assert.doesNotMatch(nav, /fontFamily: theme\.typography\.heading \}/, 'a bare key such as "dmSans" is not a font family')
  assert.match(fontCssStack('dmSans'), /^var\(--font-dm-sans\), /)
})

test('a single-list product row links to the matching shop sort', () => {
  const src = read('components/market-sections.tsx')
  assert.match(src, /\) : <Link className="mkLink" href=\{active\.key === 'new' \? '\/shop\?sort=newest' : active\.key === 'best' \? '\/shop\?sort=bestselling' : '\/shop'\}>\{tr\('Shop all'\)\}<\/Link>\} \/>/)
  const shop = read('app/shop/page.tsx')
  assert.match(shop, /'newest'/, 'the shop sorts by newest')
  assert.match(shop, /sort==='bestselling'/, 'the shop sorts by best selling')
})

test('the spotlight ends with a "Shop all" tile when the collection has fewer products than slots', () => {
  const src = read('components/market-sections.tsx')
  assert.match(src, /const limit = n\(s\.limit, 4\)\n  const items = membersOf\(chosen\)\.slice\(0, limit\)/)
  assert.match(src, /\{items\.length < limit \? \(\n\s*<div className="mkCardSlot">\n\s*<Link className="mkSpotMore" href=\{href\}>/)
  assert.match(src, /<b>\{tr\('Shop all'\)\}<\/b>\n\s*<span>\{chosen\.name\}<\/span>/, 'visible text names the collection')
})

test('home CSS: a compact kicker, even section spacing and a tablet tier, imported last', () => {
  const css = read('app/storefront-home.css')
  assert.match(css, /html body\.mk \.mkSpotText small \{ justify-self: start; \}/)
  assert.match(css, /html body\.mk \.aliTrustStrip \{ padding-top: var\(--mk-section-gap\) !important; \}/)
  assert.match(css, /@media \(min-width: 760px\) and \(max-width: 1023px\) \{\n  html body\.mk \.mkGrid \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important; \}/)
  assert.match(css, /html body\.mk \.mkSpot \{ grid-template-columns: minmax\(0, 1fr\) !important; \}/)
  const layout = read('app/layout.tsx')
  assert.ok(layout.indexOf("import './storefront-home.css'") > layout.indexOf("import './storefront-sprint4.css'"), 'loaded after the sprint 4 styles')
})
