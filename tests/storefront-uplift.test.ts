import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Storefront uplift (docs/storefront-uplift-2026-11.md): the sticky header, the shop page's title and
// toolbar, the brand's section titles on the product and cart pages, and the cart's reassurance boxes.

const read = (path: string) => readFileSync(path, 'utf8')
const css = () => read('app/storefront-uplift.css')

test('the header can stick: market storefront pages clip sideways overflow instead of making body a scroll container', () => {
  assert.match(css(), /html:has\(> body\.mk\):not\(:has\(\.adminShell\)\), html:has\(> body\.mk\):not\(:has\(\.adminShell\)\) > body \{ overflow-x: clip; \}/)
  // The rule it overrides: hidden on html and body made the body the scroll container.
  assert.match(read('app/storefront-legacy.css'), /html,body\{width:100%;max-width:100%;overflow-x:hidden\}/)
  // The header is sticky unless the theme turns it off.
  assert.match(read('components/store-nav-fixed.tsx'), /position: headerSettings\.sticky === false \? 'relative' : 'sticky', top: 0/)
  const layout = read('app/layout.tsx')
  assert.ok(layout.indexOf("import './storefront-uplift.css'") > layout.indexOf("import './storefront-motion.css'"), 'loaded last')
})

test('the header is as tall as its controls (the logo a 44 px tap target), gets a shadow once scrolled, and checkout keeps it in place', () => {
  const sheet = css()
  assert.match(sheet, /html body\.mk \.focalNav\.mkHeader \.focalLogo \{ min-height: 44px !important; \}/, 'as tall as a tap target, not 80 px')
  assert.match(read('app/storefront-legacy.css'), /\.focalLogo\{min-height:80px;/, 'the leftover rule this undoes')
  assert.match(sheet, /html body\.mk \.focalNav\.mkHeader\.focalNavScrolled \{ box-shadow: /)
  assert.match(sheet, /html body\.mk \.focalNav\.mkHeaderCheckout \{ position: relative !important; \}/)
})

test('phones: the first row tucks while scrolling down, never on one-row headers or with focus inside', () => {
  const sheet = css()
  assert.match(sheet, /@media \(max-width: 900px\) \{[^@]*html body\.mk \.focalNav\.mkHeader\.focalNavTucked:not\(\.mkHeaderProduct, \.mkHeaderCheckout\):not\(:focus-within\) \{ transform: translateY\(calc\(-100% \+ 68px\)\); \}/)
  assert.match(sheet, /@media \(prefers-reduced-motion: reduce\) \{\n  html body\.mk \.focalNav\.mkHeader \{ transition: none; \}/)
  const scroll = read('components/store-nav-scroll.tsx')
  assert.match(scroll, /nav\.classList\.toggle\('focalNavScrolled', y > 8\)/)
  assert.match(scroll, /if \(y > last \+ 4 && y > nav\.offsetHeight \+ 120\) nav\.classList\.add\('focalNavTucked'\)/)
  assert.match(scroll, /else if \(y < last - 4 \|\| y <= nav\.offsetHeight\) nav\.classList\.remove\('focalNavTucked'\)/)
  assert.match(scroll, /requestAnimationFrame\(update\)/, 'one update per frame')
  // The same rhythm as the WhatsApp button.
  assert.match(read('components/market-chrome.tsx'), /if \(y > last \+ 4 && y > 240\) setTucked\(true\)/)
})

test('focus and in-page links land below the header; the shop filters and product photos stick below it', () => {
  const sheet = css()
  assert.match(sheet, /html:has\(body\.mk\) \{ scroll-padding-top: 90px; \}/)
  assert.match(sheet, /@media \(max-width: 900px\) \{\n  html:has\(body\.mk\) \{ scroll-padding-top: 134px; \}/)
  assert.match(sheet, /@media \(min-width: 901px\) \{\n  html body\.mk \.aliShopSidebar, html body\.mk \.aliProductGallery \{ top: 92px; \}/)
})

test('the phone menu and the photo zoom lock the page itself, which keeps the header stuck', () => {
  for (const file of ['components/market-chrome.tsx', 'components/photo-zoom.tsx']) {
    const src = read(file)
    assert.match(src, /const root = document\.documentElement\n/, file)
    assert.match(src, /root\.style\.overflow = 'hidden'/, file)
    assert.doesNotMatch(src, /document\.body\.style\.overflow/, `${file} no longer locks body`)
  }
})

test('shop: a visible title on market stores, a small "Collections" label, and the count beside the sort menu', () => {
  const shop = read('components/aliexpress-shop.tsx')
  assert.match(shop, /const market = theme\.design === 'market'/)
  assert.match(shop, /<h1 className=\{market \? 'aliContainer aliShopTitle' : 'srOnly'\}>/)
  const sheet = css()
  assert.match(sheet, /@media \(min-width: 901px\) \{\n  html body\.mk \.aliShopCollections h2 \{ margin: 0 0 10px; font-family: inherit; font-size: 13px;/)
  assert.match(sheet, /html body\.mk \.aliShopMain > \.aliResultCount \{ grid-column: 1; grid-row: 1; margin: 0; \}/)
  assert.match(sheet, /html body\.mk \.aliShopMain > \.aliShopToolbar \{ grid-column: 2; grid-row: 1; margin: 0; \}/)
})

test('section titles on the shop, product and cart pages carry the speed-lines mark, mirrored in Arabic', () => {
  const sheet = css()
  const list = ':is(.aliShopTitle, .aliSectionHead h2, .aliReviewsSection > h2, .aliQuestions > h2)'
  assert.ok(sheet.includes(`html body.mk ${list} { display: flex;`), 'the title style')
  assert.ok(sheet.includes(`html body.mk ${list}::before { content: ""; display: block; flex: none; width: 30px; height: 20px;`), 'the mark')
  assert.ok(sheet.includes(`html[dir="rtl"] body.mk ${list}::before { transform: scaleX(-1); }`), 'mirrored in Arabic')
  // The headings it styles are still there.
  assert.match(read('components/aliexpress-product.tsx'), /<div className="aliContainer aliReviewsSection" id="reviews">\n\s*<h2>/)
  assert.match(read('components/aliexpress-product.tsx'), /<div className="aliSectionHead"><h2>\{t\('You may also like'\)\}<\/h2><\/div>/)
  assert.match(read('components/product-questions.tsx'), /id="questions">\n\s*<h2>\{t\('Questions & answers'\)\}<\/h2>/)
  assert.match(read('components/aliexpress-cart.tsx'), /<div className="aliSectionHead"><h2>\{t\('You might also like'\)\}<\/h2><\/div>/)
})

test('cart, phones: one column per reassurance box', () => {
  assert.match(css(), /@media \(max-width: 700px\) \{\n  html body\.mk \.cartTrustUX \{ grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: minmax\(0, 1fr\); \}/)
})
