import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Front-end sweep, sprint 3: a malformed percent-encoded path gets the not-found page instead of a 500, and the
// desktop header keeps its actions on the same row as the search and the delivery chip.

const read = (path: string) => readFileSync(path, 'utf8')

test('a path with broken percent-encoding is answered with the not-found page, before routing', () => {
  const proxy = read('proxy.ts')
  const guard = proxy.indexOf('try { decodeURIComponent(pathname) } catch')
  assert.notEqual(guard, -1, 'the guard is present')
  assert.ok(guard > proxy.indexOf('const pathname = request.nextUrl.pathname'), 'the guard runs after the path is read')
  assert.ok(guard < proxy.indexOf('const nonce = btoa'), 'the guard runs before anything else')
  assert.match(proxy, /catch \{ return NextResponse\.rewrite\(new URL\('\/not-found-page', request\.url\)\) \}/)
})

test('the desktop header has a fourth column for the delivery chip, so the actions stay on the row', () => {
  const css = read('app/storefront-market.css')
  assert.match(css, /@media \(min-width: 901px\) \{ html body\.mk \.focalNav\.mkHeader \.focalNavInner \{ grid-template-columns: auto minmax\(0, 1fr\) auto auto !important; \} \}/)
  assert.match(css, /html body\.mk \.mkDeliveryChip small \{ min-width: 0; max-width: 200px; line-height: 1\.3;/)
})
