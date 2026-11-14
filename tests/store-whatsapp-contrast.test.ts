import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// The storefront's WhatsApp buttons (docs/store-whatsapp-contrast-2026-11.md): white on WhatsApp's #25d366 is 2:1.

const read = (path: string) => readFileSync(path, 'utf8')
const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? cssFiles(path) : name.endsWith('.css') ? [path] : []
})

test('no storefront button has white text on #25d366 or its #1fa855 hover', () => {
  for (const file of cssFiles('app')) {
    const css = read(file)
    // #25d366 may still tint a box or draw a border; never fill a button.
    assert.doesNotMatch(css, /background: #25d366;/, file)
    assert.doesNotMatch(css, /background: #1fa855;/, file)
  }
})

test('the floating button, "Send my order on WhatsApp" and the invite\'s Share are #15803d (5:1)', () => {
  assert.match(read('app/storefront-market.css'), /^\.mkWhatsApp \{ position: fixed;[^}]*background: #15803d; color: #fff;/m)
  const success = read('app/order/success/success.module.css')
  assert.match(success, /\.waBtn \{[^}]*background: #15803d; color: #fff !important;/)
  assert.match(success, /\.waBtn:hover \{ background: #166534; \}/)
  const selling = read('app/storefront-selling.css')
  assert.match(selling, /\.inviteWa \{ border: 0; background: #15803d; color: #fff !important; \}\n\.inviteWa:hover \{ background: #166534; \}/)
  // The product page's "Order on WhatsApp" text already uses the same green (app/storefront-links.css).
  assert.match(read('app/storefront-links.css'), /html body \.waOrderBtn \{ color: #15803d !important; \}/)
})
