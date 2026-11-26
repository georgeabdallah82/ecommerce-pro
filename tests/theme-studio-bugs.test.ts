import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Theme editor bugs found by using it in a browser (docs/theme-studio-bugs-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')

test('the homepage add list does not offer a second footer', () => {
  const studio = read('components/theme-studio.tsx')
  assert.match(studio, /isHome \? !\['announcement', 'header', 'footer', 'main_product', 'main_collection_banner', 'main_collection_grid'\]\.includes\(key\)/)
})

test('the cookie notice is not shown inside the theme editor preview', () => {
  assert.match(read('components/cookie-consent.tsx'), /if \(!open \|\| pathname\.startsWith\('\/admin'\) \|\| pathname === '\/theme-editor-preview'\) return null/)
})

test('a logo list with no logos is a note in the editor and nothing on the shop', () => {
  assert.match(read('components/storefront-sections.tsx'), /if\(type==='logo_list'\)\{if\(!\(section\.blocks\|\|\[\]\)\.length\)return preview\?<EmptySectionNotice [^>]*name="Logo list"[^>]*\/>:null;/)
})

// Second round: every control in every section and Theme settings page was changed in the editor and the preview compared.
test('the Advanced tab no longer offers an Animation choice that no section applied', () => {
  const studio = read('components/theme-studio.tsx')
  assert.doesNotMatch(studio, /<option value="zoom">Zoom<\/option>/)
  assert.match(studio, /rise into view as shoppers scroll to them/)
})

test('Product tabs keep a heading the owner wrote when only the New tab can show', () => {
  const market = read('components/market-sections.tsx')
  assert.match(market, /const ownHeading = \(heading: unknown\) => \{ const h = String\(heading \|\| ''\)\.trim\(\); return h === "Today's deals" \? '' : h \}/)
  assert.match(market, /!s\.newOnlyKeepHeading && ownHeading\(s\.heading\) === '' \? tr\('New arrivals'\)/)
})

test('the image banner says its Height needs "Fixed height"', () => {
  assert.match(read('components/theme-section-inspector.tsx'), /range\('Height \(with "Fixed height" on\)', 'minHeight', 360, 900, 640\)/)
})

test('the Collection template can be previewed as a collection page, not only the Shop page', () => {
  const frame = read('components/theme-preview-frame.tsx')
  assert.match(frame, /import AliExpressCollectionDetail from '@\/components\/aliexpress-collection-detail'/)
  assert.match(frame, /<button type="button" aria-pressed=\{!!showCollection\} onClick=\{\(\) => setCollectionView\('collection'\)\}>A collection: \{collection\.name\}<\/button>/)
  assert.match(frame, /<AliExpressCollectionDetail theme=\{view\.theme\} collection=\{collection\} products=\{view\.products\.filter\(p => ids\.has\(p\.id\)\)\} sections=\{view\.sections\}/)
})
