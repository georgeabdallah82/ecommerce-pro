import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Product cards (docs/store-cards-2026-11.md): the card is no longer one link holding its buttons. The product's name
// is the link and covers the card, and the heart and "Add to cart" are buttons beside it, described by the name.

const read = (path: string) => readFileSync(path, 'utf8')
const source = read('components/storefront-sections.tsx')
const start = source.indexOf("if(theme.design==='market'){")
const marketCard = source.slice(start, source.indexOf('\n  return (', start))

test('the market card is not a link; its name is', () => {
  assert.notEqual(start, -1)
  assert.match(marketCard, /<div className="mkCard" onPointerEnter=\{secondaryImage&&!peek\?e=>\{if\(e\.pointerType==='mouse'\)setPeek\(true\)\}:undefined\}>/)
  // In the theme editor a click on the card still selects its section, as before.
  assert.match(marketCard, /<h3 id=\{nameId\}><Link href=\{`\/product\/\$\{p\.slug\}`\} onClick=\{preview\?e=>\{e\.preventDefault\(\);e\.stopPropagation\(\);onSelect\?\.\(\)\}:undefined\} className="mkCardLink">\{p\.name\}<\/Link><\/h3>/)
  assert.equal((marketCard.match(/<Link\b/g) || []).length, 1, 'one link per card')
  assert.doesNotMatch(marketCard, /className="mkCard">/)
})

test('no button sits inside the card\'s link', () => {
  const links = marketCard.match(/<Link\b[\s\S]*?<\/Link>/g) || []
  assert.equal(links.length, 1)
  for (const link of links) assert.doesNotMatch(link, /<button\b/)
  // The heart and the cart button are still on the card, outside the link, and say which product they act on.
  assert.equal((marketCard.match(/aria-describedby=\{nameId\}/g) || []).length, 3, 'the heart, "Sold out" and "Add to cart"')
  assert.match(marketCard, /className=\{`mkCardWish \$\{wished\?'active':''\}`\} onClick=\{wish\} aria-label=\{wished\?t\('Remove from wishlist'\):t\('Add to wishlist'\)\} aria-describedby=\{nameId\}>/)
  assert.match(marketCard, /className=\{`mkCardAdd \$\{added\?'done':''\}`\} onClick=\{quickAdd\} aria-describedby=\{nameId\}>/)
})

test('the photo is read only when it has a description of its own', () => {
  assert.match(marketCard, /const photoAlt=p\.images\?\.\[0\]\?\.alt&&p\.images\[0\]\.alt!==p\.name\?p\.images\[0\]\.alt:'';/)
  assert.match(marketCard, /<StoreImage src=\{primaryImage\} alt=\{photoAlt\}\/>/)
})

test('the link covers the card, and the photo\'s heart and "Add to cart" stay clickable above it', () => {
  const css = read('app/storefront-cards.css')
  assert.match(css, /html body\.mk \.mkCard \{ position: relative; isolation: isolate; \}/)
  assert.match(css, /html body\.mk \.mkCardLink \{ color: inherit; text-decoration: none; \}/)
  assert.match(css, /html body\.mk \.mkCardLink::after \{ content: ""; position: absolute; inset: 0; \}/)
  // A lifted photo (hover) is a layer of its own, so the photo, not just its heart, has to sit above the link's cover.
  assert.match(css, /html body\.mk \.mkCardMedia \{ z-index: 1; pointer-events: none; \}/)
  assert.match(css, /html body\.mk \.mkCardWish \{ pointer-events: auto; \}/)
  assert.match(css, /html body\.mk \.mkCardAdd \{ position: relative; z-index: 1; \}/)
})

test('the keyboard ring is drawn around the whole card, with or without :has()', () => {
  const css = read('app/storefront-cards.css')
  assert.match(css, /@supports selector\(:has\(a\)\) \{\n\s+html body\.mk \.mkCard:has\(\.mkCardLink:focus-visible\) \{ outline: 3px solid var\(--mk-red, #d7261e\); outline-offset: 2px; \}/)
  assert.match(css, /@supports not selector\(:has\(a\)\) \{\n\s+html body\.mk \.mkCardLink:focus-visible \{ outline: none; \}\n\s+html body\.mk \.mkCardLink:focus-visible::after \{ outline: 3px solid var\(--mk-red, #d7261e\); outline-offset: 2px; \}/)
  // The same ring the card had as a link (app/storefront-market.css).
  assert.match(read('app/storefront-market.css'), /:focus-visible \{ outline: 3px solid var\(--mk-red, #d7261e\); outline-offset: 2px; box-shadow: none; \}/)
})

test('the card styles load last', () => {
  const layout = read('app/layout.tsx')
  assert.ok(layout.indexOf("import './storefront-cards.css'") > layout.indexOf("import './storefront-interactive.css'"))
})
