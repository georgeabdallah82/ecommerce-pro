import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// Customer journey fixes (phone): sticky Add to cart, a quiet checkout header, one search box on /shop.
const read = (path: string) => readFileSync(path, 'utf8')
const css = read('app/storefront-market.css')

describe('storefront journey', () => {
  it('product page: sticky Add to cart only after the real buttons scroll out of view', () => {
    const product = read('components/aliexpress-product.tsx')
    assert.match(product, /<StickyBuyBar watch="\.aliBuyRow"/)
    assert.match(product, /\{canSell && <StickyBuyBar/)
    const bar = read('components/sticky-buy-bar.tsx')
    assert.match(bar, /new IntersectionObserver/)
    assert.match(bar, /entry\.boundingClientRect\.bottom < 0/)
    assert.match(bar, /classList\.toggle\('hasStickyBuy', show\)/)
    assert.match(css, /body\.hasStickyBuy \.mkWhatsApp \{ bottom:/)
    assert.match(css, /\.stickyBuy \{ display: none; \}/)
  })
  it('checkout: header keeps the logo but drops search, menu and category tabs', () => {
    const nav = read('components/store-nav-fixed.tsx')
    assert.match(nav, /pathname === '\/checkout' \? ' mkHeaderCheckout'/)
    assert.match(nav, /pathname !== '\/checkout' && headerSettings\.showCategoryTabs/)
    assert.match(css, /\.mkHeaderCheckout \.aliNavSearchWrap/)
    assert.match(css, /\.mkHeaderCheckout \.focalNavMobile/)
  })
  it('shop page: the in-page search is hidden on phones but still sent with the sort form', () => {
    assert.match(css, /@media \(max-width: 700px\) \{\s*\.aliShopToolbar \.aliShopSearch, \.aliShopToolbar button\[type=submit\] \{ display: none; \}/)
    const shop = read('components/aliexpress-shop.tsx')
    assert.match(shop, /name="q"/)
    assert.match(shop, /onChange=\{e => e\.currentTarget\.form\?\.submit\(\)\}/)
  })
  it('cart drawer buttons are thumb-sized', () => {
    const nav = read('components/store-nav-fixed.tsx')
    assert.match(nav, /\.focalCartQty button\{width:36px;height:36px;/)
    assert.match(nav, /\.focalCartDeleteBtn\{[^}]*min-width:40px;min-height:40px/)
  })
})
