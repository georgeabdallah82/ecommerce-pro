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
