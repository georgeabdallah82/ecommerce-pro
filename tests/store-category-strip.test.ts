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
