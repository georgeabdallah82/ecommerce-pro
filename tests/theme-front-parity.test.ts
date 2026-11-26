import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { marketDisplayFace, fontCssStack } from '@/lib/font-options'

// Theme settings the market storefront ignored, and the Shop preview's order (docs/theme-front-parity-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')

test('headlines use Bricolage until the owner picks another heading font', () => {
  assert.equal(marketDisplayFace(undefined), 'var(--font-bricolage)')
  assert.equal(marketDisplayFace('dmSans'), 'var(--font-bricolage)')
  assert.equal(marketDisplayFace('libreCaslonText'), fontCssStack('libreCaslonText'))
  for (const file of ['app/layout.tsx', 'components/theme-preview-frame.tsx']) {
    assert.match(read(file), /'--store-display-face': marketDisplayFace\(theme\.typography\?\.heading\)/, file)
  }
  assert.match(read('app/storefront-market.css'), /--mk-display: var\(--store-display-face, var\(--font-bricolage\)\), var\(--store-font-heading\)/)
})

test('market buttons, page width and section gaps follow Theme settings, with the old values as the defaults', () => {
  const css = read('app/storefront-market.css')
  assert.match(css, /\.mkBtn \{[^}]*border-radius: var\(--store-button-radius, 10px\); text-transform: var\(--store-btn-transform, none\); min-height: var\(--store-button-height, 46px\);/)
  assert.match(css, /html body\.mk \.mkCardAdd \{ min-height: 44px; border-radius: var\(--store-button-radius, var\(--mk-radius-sm\)\); text-transform: var\(--store-btn-transform, none\);/)
  assert.match(css, /\.mkWrap \{ width: min\(calc\(var\(--store-max, 1360px\) - 32px\), 100%\);/)
  assert.doesNotMatch(css, /min\(1328px, 100%\)/)
  assert.match(css, /--mk-section-gap: calc\(var\(--store-section-space, 76px\) \* 40 \/ 76\);/)
  assert.match(css, /@media \(min-width: 760px\) \{ body\.mk \{ --mk-section-gap: calc\(var\(--store-section-space, 76px\) \* 64 \/ 76\); \} \}/)
})

test('the Shop page preview lists newest first, like the live Shop page', () => {
  const frame = read('components/theme-preview-frame.tsx')
  assert.match(frame, /<AliExpressShop theme=\{view\.theme\} products=\{newestFirst\(view\.products\)\}/)
  assert.match(read('app/shop/page.tsx'), /const sort=sp\.sort\|\|'newest'/)
})
