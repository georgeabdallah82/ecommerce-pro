import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { collectionPhoto, realPhoto } from '../lib/collection-photo'
import { categoryGlyph } from '../lib/category-glyph'
import { GLYPH_ICONS } from '../components/department-glyph'

// Store polish (docs/store-polish-2026-11.md): collections without a photo, the signed-out account page, product
// photos on phones, and the search box.

const read = (path: string) => readFileSync(path, 'utf8')

test('a collection photo is never the stock placeholder, and any real photo is kept as it is', () => {
  assert.equal(realPhoto('/placeholder-product.svg'), null)
  assert.equal(realPhoto('https://cdn.example.com/placeholder-product.svg?v=2'), null)
  assert.equal(realPhoto(''), null)
  assert.equal(realPhoto('   '), null)
  assert.equal(realPhoto(null), null)
  assert.equal(realPhoto(' /uploads/kitchen.jpg '), '/uploads/kitchen.jpg')
  assert.equal(realPhoto('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg')
  assert.equal(realPhoto('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA', 'stores that keep inline images are unchanged')
  assert.equal(collectionPhoto('/own.jpg', ['/p1.jpg']), '/own.jpg', 'its own photo first')
  assert.equal(collectionPhoto('/placeholder-product.svg', [null, '/placeholder-product.svg', '/p2.jpg']), '/p2.jpg', 'then the first real product photo')
  assert.equal(collectionPhoto(null, ['/placeholder-product.svg']), null, 'otherwise none: the department glyph')
})

test('every department has a glyph, shared by the category strip, the collections page and the menus', () => {
  for (const name of ['Best Sellers', 'Laundry care', 'Kitchen essentials', 'Home Essentials', 'Something else', 'مطبخ']) {
    assert.ok(GLYPH_ICONS[categoryGlyph(name)], name)
  }
  const sections = read('components/storefront-sections.tsx')
  assert.match(sections, /import \{GLYPH_ICONS\} from '@\/components\/department-glyph'/)
  assert.doesNotMatch(sections, /const GLYPH_ICONS/, 'one map, in components/department-glyph.tsx')
})

test('the collections page, the menus and the collection banner use a real photo or the department glyph', () => {
  assert.match(read('app/collections/page.tsx'), /const imageUrl = collectionPhoto\(c\.imageUrl, visible\.map\(x => \(x\.product as any\)\?\.images\?\.\[0\]\?\.url\)\)/)
  assert.match(read('app/api/store/collections/route.ts'), /imageUrl: collectionPhoto\(c\.imageUrl, visible\.map\(x => \(x\.product as any\)\?\.images\?\.\[0\]\?\.url\)\),/)
  const list = read('components/aliexpress-collections.tsx')
  assert.match(list, /\{c\.imageUrl \? <StoreImage src=\{c\.imageUrl\} alt=\{c\.name \|\| t\('Collection'\)\} \/> : <span className="collectionArt"><DepartmentGlyph name=\{c\.name \|\| ''\}/)
  assert.doesNotMatch(list, /placeholder-product/)
  const detail = read('components/aliexpress-collection-detail.tsx')
  assert.match(detail, /\{showImage && realPhoto\(collection\.imageUrl\) \? \(/)
  assert.doesNotMatch(detail, /placeholder-product/)
  const chrome = read('components/market-chrome.tsx')
  assert.match(chrome, /const photo = realPhoto\(src\)\n  if \(!photo \|\| failed\) return <span className="mkTileGlyph"><DepartmentGlyph name=\{name\}/)
  assert.equal((chrome.match(/<MenuImage src=\{c\.imageUrl\} name=\{c\.name\} \/>/g) || []).length, 2, 'the desktop panel and the phone menu')
})

test('signed out, the account page goes straight to sign-in', () => {
  const page = read('app/account/page.tsx')
  assert.match(page, /import \{ redirect \} from 'next\/navigation'/)
  assert.match(page, /if\(!u\)redirect\('\/account\/login'\)/)
  // The sign-in page brings the shopper back to their account.
  assert.match(read('app/account/login/page.tsx'), /const nextQuery = next === '\/account' \? '' :/)
})

test('product photos: a count on phones, and a photo the shopper turns to fades in (never the first)', () => {
  const pdp = read('components/aliexpress-product.tsx')
  assert.match(pdp, /\{swipeCount > 1 && <span className="pdpPhotoCount" aria-hidden="true">\{activeImgIndex \+ 1\} \/ \{swipeCount\}<\/span>\}/)
  assert.match(pdp, /if \(activeImgIndex === shownPhoto\.current\) return\n    shownPhoto\.current = activeImgIndex\n    setPhotoTurned\(true\)/)
  assert.match(pdp, /<StoreImage key=\{activeImage\} src=\{activeImage\}/)
  const css = read('app/storefront-polish.css')
  assert.match(css, /\.pdpPhotoCount \{ display: none; \}\n@media \(max-width: 899px\) \{\n  html body\.mk \.pdpPhotoCount \{ display: block;/)
  assert.match(css, /inset-inline-start: 12px/, 'opposite the zoom button, in both directions')
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\n  html body\.mk \.aliProductMainImage\.isTurned img \{ animation: pdpPhotoIn/)
})

test('the search box is a rounded field that can shrink, and the styles load last', () => {
  const css = read('app/storefront-polish.css')
  assert.match(css, /html body\.mk \.focalSearchHeader input \{ min-width: 0; border-radius: 10px;/)
  const layout = read('app/layout.tsx')
  assert.ok(layout.indexOf("import './storefront-polish.css'") > layout.indexOf("import './storefront-uplift.css'"))
})

test('the old price of a product on sale is readable on a card (4.5:1)', () => {
  assert.match(read('app/storefront-polish.css'), /html body\.mk \.mkCardPrice del \{ color: var\(--mk-muted, #5b616b\); \}/)
  assert.match(read('app/storefront-market.css'), /\.mkCardPrice del \{ font-size: 12\.5px; color: #9ca3af; \}/, 'the 2.3:1 rule it overrides')
})
