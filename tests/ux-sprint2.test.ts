import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// UX uplift, sprint 2 (docs/ux-sprint2-2026-11.md): the checkout reads in the order it is seen, the delivery area is one
// header chip (under the logo on phones) instead of its own row, the shop has one search, a deals tab fills a row, category
// circles never show a letter, and touch devices get 44 px targets.

const read = (path: string) => readFileSync(path, 'utf8')

test('checkout: the form comes first in the page, the order summary follows it, and the discount code is in the form', () => {
  const page = read('app/checkout/page.tsx')
  const form = page.indexOf('<form ref={formRef}')
  const formEnd = page.indexOf('</form>')
  const summary = page.indexOf('{summary}')
  assert.ok(form !== -1 && formEnd > form, 'the form is found')
  assert.ok(summary > formEnd, 'the summary is after the form in the DOM')
  assert.match(page, /<p className=\{s\.totalBar\}><span>\{t\('Total'\)\}<\/span><strong>\{money\(total\)\}<\/strong><\/p>/)
  const discount = page.indexOf('id="co-discount"')
  assert.ok(discount > form && discount < formEnd, 'the discount field is inside the form, before Place order')
  assert.match(read('app/checkout/checkout.module.css'), /@media \(min-width: 960px\) \{ \.totalBar \{ display: none; \} \}/)
})

test('the delivery area is one chip: in the header row on computers, at the start of the search bar on phones, and never its own row', () => {
  const nav = read('components/store-nav-fixed.tsx')
  assert.match(nav, /<DeliveryBar theme=\{theme\} variant="header" \/>/)
  assert.match(nav, /<div className="aliNavSearchBar">\n\s*\{market && <DeliveryBar theme=\{theme\} variant="search" \/>\}/)
  assert.doesNotMatch(nav, /\{market && <DeliveryBar theme=\{theme\} \/>\}/)
  const chrome = read('components/market-chrome.tsx')
  assert.match(chrome, /className=\{`mkDeliveryChip mkDeliveryChip--\$\{variant\}`\}/)
  assert.match(chrome, /window\.addEventListener\(DELIVERY_AREA_EVENT, sync\)/)
  assert.match(read('app/storefront-market.css'), /@media \(max-width: 900px\) \{\n  html body\.mk \.mkDeliveryChip--header \{ display: none; \}/)
})

test('the shop has one search (the header); its sort form still sends the current search', () => {
  const shop = read('components/aliexpress-shop.tsx')
  assert.doesNotMatch(shop, /aliShopSearch/)
  assert.doesNotMatch(shop, /<button type="submit" className="focalButton primary">\{t\('Search'\)\}<\/button>/)
  assert.match(shop, /\{query\.q && <input type="hidden" name="q" value=\{query\.q\} \/>\}/)
  assert.match(shop, /onChange=\{e => e\.currentTarget\.form\?\.submit\(\)\}/)
})

test('deals: a tab shows only when it can fill a row, and the default row holds five products (one line on a computer)', () => {
  assert.match(read('components/market-sections.tsx'), /return out\.filter\(l => l\.items\.length >= n\(s\.minProducts, 4\)\)/)
  assert.match(read('lib/storefront-market.ts'), /showNew: true, limit: 5, minProducts: 4 \} \}/)
})

test('category circles: no letter fallback; a neutral tile with an icon instead', () => {
  const sections = read('components/storefront-sections.tsx')
  assert.doesNotMatch(sections, /categoryInitial/)
  assert.doesNotMatch(sections, /aliCategoryInitial/)
  // Sprint 4 replaced the one grid icon with a department glyph picked from the category's name (lib/category-glyph.ts).
  assert.match(sections, /createElement\(GLYPH_ICONS\[categoryGlyph\(name\)\],\{size:32,strokeWidth:1\.6,'aria-hidden':true\}\)/)
})

test('touch devices get the 44 px targets too, not only phones', () => {
  const css = read('app/storefront-market.css')
  assert.match(css, /@media \(max-width: 600px\), \(pointer: coarse\) \{/)
  assert.match(css, /html body\.mk \.mkCatsAll \{ min-height: 44px !important; \}/)
  assert.match(css, /html body\.mk \.mkArrow \{ width: 44px !important; height: 44px !important; \}/)
})
