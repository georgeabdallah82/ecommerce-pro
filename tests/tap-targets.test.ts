import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// Phone tap targets: small links and icons get a transparent hit area of about 44 pixels.
const css = readFileSync('app/storefront-market.css', 'utf8')

describe('tap targets', () => {
  it('footer social icons have a larger hit area', () => {
    assert.match(css, /html body \.focalFooterSocial a::after \{ content: ""; position: absolute; inset: -6px; \}/)
  })
  it('small text links on the account pages have a larger hit area', () => {
    assert.match(css, /html body p\.muted > a::after, html body \.aliLegalPage a::after \{ content: ""; position: absolute; inset: -12px -6px; \}/)
  })
  it('carousel dots already have a larger hit area', () => {
    assert.match(css, /\.mkDots button::after \{ content: ''; position: absolute;/)
  })
})
