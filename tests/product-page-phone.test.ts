import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const css = readFileSync('app/storefront-market.css', 'utf8')
const page = readFileSync('components/aliexpress-product.tsx', 'utf8')

describe('product page on phones', () => {
  it('shows one arrow on an open accordion row', () => {
    // storefront-legacy.css adds a "-" after the open row's chevron (details[open] summary:after).
    assert.match(css, /details\[open\] summary:after \{ content: none; \}/)
  })

  it('keeps Add to cart on one line, with Buy now underneath (in-stock products only)', () => {
    assert.match(css, /\.aliBuyRow:has\(\.aliAddToCart\) \{ flex-wrap: wrap;/)
    assert.match(css, /\.aliBuyRow \.aliBuyNow \{ order: 1; flex: 1 0 100%; \}/)
  })

  it('does not show empty stars and "0 reviews" before the first review', () => {
    assert.match(page, /reviews\.length > 0 && <span className="aliProductRating">/)
  })
})
