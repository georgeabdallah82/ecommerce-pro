import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { AR } from '../lib/i18n-ar'
import { categoryGlyph } from '../lib/category-glyph'
import { firstHeroPhoto, safePhotoUrl } from '../lib/hero-photo'

// UX sprint 4: the category strip, the cart rows, the sign-in page, the not-found page and the Best Sellers
// minimum. Source checks, the same way sprints 1 to 3 are checked, plus the two helpers those pages use.

const read = (path: string) => readFileSync(path, 'utf8')

test('the sprint 4 stylesheet is imported last, after the selling styles', () => {
  const layout = read('app/layout.tsx')
  const sprint4 = layout.indexOf("import './storefront-sprint4.css'")
  assert.notEqual(sprint4, -1, 'the stylesheet is imported')
  assert.ok(sprint4 > layout.indexOf("import './storefront-selling.css'"), 'it comes after the selling styles')
})

test('a category without a photo gets a department glyph from its name, not one placeholder for all', () => {
  assert.equal(categoryGlyph('Best Sellers'), 'trending')
  assert.equal(categoryGlyph('Featured'), 'featured')
  assert.equal(categoryGlyph('Home Essentials'), 'home')
  assert.equal(categoryGlyph('Kitchen essentials'), 'kitchen', 'a specific department wins over "essentials"')
  assert.equal(categoryGlyph('Tissues & paper'), 'paper')
  assert.equal(categoryGlyph('Wholesale'), 'bulk', '"wholesale" is not a sale')
  assert.equal(categoryGlyph('Pet food'), 'pets', 'pets win over food')
  assert.equal(categoryGlyph('Baby wipes'), 'baby', 'baby wins over wipes')
  assert.equal(categoryGlyph('Carpets'), 'other', '"carpet" is not a pet')
  assert.equal(categoryGlyph('مطبخ'), 'kitchen')
  // Raw Arabic in a regular expression stays raw in the Cloudflare bundle and fails scripts/check-worker-charset.mjs.
  assert.match(read('lib/category-glyph.ts'), /^[\x00-\x7f]*$/, 'the source is ASCII: Arabic words are \\u escapes in strings')
  assert.equal(categoryGlyph(''), 'other')
  assert.equal(categoryGlyph(undefined), 'other')
  const sections = read('components/storefront-sections.tsx')
  assert.match(sections, /createElement\(GLYPH_ICONS\[categoryGlyph\(name\)\]/)
  assert.doesNotMatch(sections, /LayoutGrid/, 'the old placeholder is gone')
  assert.match(sections, /<img src=\{photo\} alt="" /, 'the photo is decorative: the name is right beside it')
})

test('the category strip: wide cards for up to four categories, rows of tiles on phones, a visible focus ring', () => {
  const css = read('app/storefront-sprint4.css')
  assert.match(css, /html body\.mk \.aliCategoryRow:not\(:has\(> \.aliCategoryItem:nth-child\(5\)\)\) \{ grid-template-columns: repeat\(auto-fit, minmax\(220px, 1fr\)\) !important;/)
  // Phones show every category in rows (docs/store-category-strip-2026-11.md); the sideways row hid all but three.
  assert.match(css, /@media \(max-width: 759px\) \{\n  html body\.mk \.aliCategoryRow \{ grid-auto-flow: row !important; grid-template-columns: repeat\(auto-fill, minmax\(76px, 1fr\)\) !important;/)
  assert.match(css, /html body\.mk \.aliCategoryItem:focus-visible \.aliCategoryIcon \{ border-color: var\(--mk-ink\) !important; box-shadow: 0 0 0 2px var\(--mk-ink\) !important; \}/)
})

test('cart checkboxes are drawn inside 44 px touch targets, in a lane left of the photo', () => {
  const css = read('app/storefront-sprint4.css')
  assert.match(css, /html body\.mk \.aliCartRowCheckHit \{ position: relative; display: grid; place-items: center; width: 44px; height: 44px;/)
  assert.match(css, /html body\.mk \.aliCartCheck \{ position: relative; display: inline-flex; align-items: center; gap: 10px; min-height: 44px;/)
  // The real checkbox is transparent and covers the whole target: it still takes focus and clicks.
  assert.match(css, /html body\.mk \.aliCartRowCheckHit > input \{ position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0;/)
  assert.match(css, /html body\.mk \.aliCartCheck > input \{ position: absolute; inset-inline-start: 0; top: 0; width: 44px; height: 44px; margin: 0; opacity: 0;/)
  assert.match(css, /html body\.mk \.cartPage \.aliCartRowMedia \{ flex-direction: row !important; align-items: center !important;/)
  const cart = read('components/aliexpress-cart.tsx')
  assert.match(cart, /className="aliCartRowCheck"/)
  assert.match(cart, /aria-label=\{t\('Select all items'\)\}/)
})

test("the sign-in panel uses the store's own first hero photo, and only a safe URL", () => {
  const sections = [
    { type: 'announcement', blocks: [] },
    { type: 'hero_slider', enabled: false, blocks: [{ settings: { imageUrl: '/off.jpg' } }] },
    { type: 'hero_slider', blocks: [{ settings: { heading: 'No photo' } }, { settings: { imageUrl: '/stock/hero-kitchen.jpg' } }] },
  ]
  assert.equal(firstHeroPhoto(sections), '/stock/hero-kitchen.jpg')
  assert.equal(firstHeroPhoto([{ type: 'hero', settings: { imageUrl: 'https://cdn.example.com/a.jpg' } }]), 'https://cdn.example.com/a.jpg')
  assert.equal(firstHeroPhoto([]), null)
  assert.equal(firstHeroPhoto(null), null)
  assert.equal(safePhotoUrl('javascript:alert(1)'), null)
  assert.equal(safePhotoUrl('//evil.example/a.jpg'), null)
  assert.equal(safePhotoUrl('data:image/png;base64,AAAA'), null)
  assert.match(read('app/account/login/page.tsx'), /firstHeroPhoto\(state\.sections\)/)
})

test('sign-in keeps its fields, errors and links, without an all-caps label or a second landmark', () => {
  const page = read('app/account/login/page.tsx')
  assert.match(page, /<div className="authPanel">/)
  assert.doesNotMatch(page, /<aside/, 'an aside inside main is a nested complementary landmark')
  assert.doesNotMatch(page, /t\('ACCOUNT'\)/, 'no all-caps label above the heading')
  assert.match(page, /<form action=\{login\} className="authForm">/)
  assert.match(page, /<input className="input" id="email" name="email" type="email"/)
  assert.match(page, /<input className="input" id="password" name="password" type="password"/)
  assert.match(page, /href="\/account\/forgot-password"/)
  assert.match(page, /\{invalid && <div className="alert danger" role="alert">/)
  assert.match(page, /\{rateLimited && <div className="alert danger" role="alert">/)
  assert.match(read('app/storefront-sprint4.css'), /html body\.mk \.authPanel \{ display: none; \}/)
})

test("the not-found page searches the shop, links only to pages that exist, and offers the shop's categories", () => {
  const page = read('app/not-found.tsx')
  assert.match(page, /<form action="\/shop" method="GET" role="search"/)
  assert.match(page, /<input type="search" name="q"/)
  assert.match(page, /href="\/shop"/)
  assert.match(page, /href="\/orders\/lookup"/)
  assert.match(page, /href=\{`\/shop\?collection=\$\{encodeURIComponent\(c\.slug\)\}`\}/)
  assert.match(page, /\} catch \{\n    return \[\]\n  \}/, 'a failed category read hides the row instead of breaking the page')
  for (const route of ['app/shop/page.tsx', 'app/orders/lookup/page.tsx']) {
    assert.ok(existsSync(route), `${route} exists`)
  }
})

test('Best Sellers shows a row only once four products can fill it', () => {
  const sections = read('components/storefront-sections.tsx')
  assert.match(sections, /if\(sold\.length<4\)\{const gap=bestSellersGap\(usingSold,sold\.length,newArrivals\.length\)/)
  assert.doesNotMatch(sections, /if\(!sold\.length\)return preview\?<EmptySectionNotice key=\{section\.id\} id=\{section\.id\} name="Best sellers"/)
})

test('every new sign-in string has an Arabic translation', () => {
  const dict = AR as Record<string, string | undefined>
  for (const key of [
    'Welcome back',
    'Your orders, addresses and wishlist, in one place.',
    'Track every order',
    'Keep your wishlist and addresses',
    'Check out faster next time',
  ]) {
    assert.ok(dict[key], `Arabic entry for "${key}"`)
    assert.notEqual(dict[key], key, `"${key}" is translated, not copied`)
  }
})
