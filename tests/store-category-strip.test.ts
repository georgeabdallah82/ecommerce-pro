import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// "Shop by category" shows every active collection (docs/store-category-strip-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')

test('the menus list every active collection, one with no products yet too (the owner chose that)', () => {
  const route = read('app/api/store/collections/route.ts')
  assert.match(route, /where: \{ isActive: true \}/)
  assert.doesNotMatch(route, /\.filter\(c => c\.count > 0\)/)
})

test('the home page loads the collections the theme editor shows: 24, not 12', () => {
  const take = (src: string) => Number(/collection\.findMany\(\{ ?where: ?\{ ?isActive: ?true ?\}, ?include: ?\{ ?products: ?\{ ?select: ?\{ ?productId: ?true ?\} ?\} ?\}, ?take: ?(\d+)/.exec(src)?.[1])
  assert.equal(take(read('app/page.tsx')), 24)
  assert.equal(take(read('lib/zone-data.ts')), 24)
})

test('phones show the strip as rows of tiles, not a sideways row with its scrollbar hidden', () => {
  const css = read('app/storefront-sprint4.css')
  const phone = css.slice(css.indexOf('@media (max-width: 759px) {'))
  const block = phone.slice(0, phone.indexOf('\n}'))
  assert.match(block, /\.aliCategoryRow \{ grid-auto-flow: row !important; grid-template-columns: repeat\(auto-fill, minmax\(76px, 1fr\)\) !important;[^}]*overflow: visible !important;/)
  assert.doesNotMatch(block, /overflow-x: auto|scroll-snap/)
})

// The theme editor's options for this section reach the shop the same way on phones and computers
// (docs/category-strip-editor-sync-2026-11.md).
test('up to four categories are the same wide cards on phones and computers', () => {
  const css = read('app/storefront-sprint4.css')
  const cards = css.indexOf('html body.mk .aliCategoryRow:not(:has(> .aliCategoryItem:nth-child(5))) { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))')
  assert.notEqual(cards, -1)
  // Not inside a computers-only block any more: nothing opens a media query between the strip's start and the cards.
  const before = css.slice(css.indexOf('/* ---- Category strip'), cards)
  assert.doesNotMatch(before, /@media \(min-width: 760px\)/)
  assert.match(css, /@media \(max-width: 759px\) \{\n  html body\.mk \.aliCategoryRow:not\(:has\(> \.aliCategoryItem:nth-child\(5\)\)\) \{ gap: 10px !important; \}/)
})

test('"Section width" and "Card position" from the editor work on the shop', () => {
  const css = read('app/storefront-sprint4.css')
  assert.match(css, /html body\.mk \.aliCategoryStrip\.has-sec-w :is\(\.mkStripHead, \.aliContainer\) \{ width: min\(var\(--sec-w\), 100%\) !important;/)
  assert.match(css, /\.aliCategoryStrip\.has-sec-w\.sec-left :is\(\.mkStripHead, \.aliContainer\) \{ margin-inline: max\(0px, calc\(\(100% - \(var\(--store-max, 1360px\) - 32px\)\) \/ 2\)\) auto !important; \}/)
  assert.match(css, /\.aliCategoryStrip\.has-sec-w\.sec-right :is\(\.mkStripHead, \.aliContainer\) \{ margin-inline: auto max\(0px/)
  assert.match(css, /html body\.mk \.aliCategoryStrip:is\(\.block-center, \.block-right\) \.aliCategoryRow \{ display: flex !important; flex-wrap: wrap !important; \}/)
  assert.match(css, /html body\.mk \.aliCategoryStrip\.block-center \.aliCategoryRow \{ justify-content: center !important; \}/)
  assert.match(css, /html body\.mk \.aliCategoryStrip\.block-right \.aliCategoryRow \{ justify-content: flex-end !important; \}/)
  // The section still carries the classes the editor's settings set.
  assert.match(read('components/storefront-sections.tsx'), /className=\{`aliCategoryStrip\$\{boxClass\(s\)\}/)
})
