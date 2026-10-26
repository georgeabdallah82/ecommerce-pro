import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// Phone fixes on the storefront: hero speed lines in the logo's orange, no discount badge over the
// product photo (the price row shows it), the WhatsApp button tucks away while scrolling down, and
// the offer tiles get a deeper shade so their words read on bright photos.
const css = readFileSync('app/storefront-market.css', 'utf8')
const chrome = readFileSync('components/market-chrome.tsx', 'utf8')

describe('phone storefront polish', () => {
  it('hero speed lines are orange on phones', () => {
    assert.match(css, /@media \(max-width: 759px\) \{\s*html body\.mk \.mkHero-full \.mkSlideCopy::before \{\s*background:\s*linear-gradient\(var\(--br-orange\)/)
  })
  it('the discount badge on the product photo is hidden on phones', () => {
    assert.match(css, /html body \.aliProductDiscountBadge \{ display: none !important; \}/)
  })
  it('the WhatsApp button tucks away while scrolling down and comes back on scroll up', () => {
    assert.match(chrome, /if \(y > last \+ 4 && y > 240\) setTucked\(true\)/)
    assert.match(chrome, /else if \(y < last - 4\) setTucked\(false\)/)
    assert.match(chrome, /\$\{tucked \? 'tucked' : ''\}/)
    assert.match(css, /\.mkWhatsApp\.tucked \{ transform: translateY\(170%\); opacity: 0; pointer-events: none; \}/)
  })
  it('offer tiles have a deeper shade under the words', () => {
    assert.match(css, /html body\.mk \.mkOfferText \{ background: linear-gradient\(0deg, rgba\(0,0,0,\.82\) 0%/)
  })
})
