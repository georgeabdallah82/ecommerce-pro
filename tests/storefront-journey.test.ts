import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// Customer journey fixes (phone): sticky Add to cart, a quiet checkout header, one search box on /shop.
const read = (path: string) => readFileSync(path, 'utf8')
const css = read('app/storefront-market.css')

describe('storefront journey', () => {
  it('product page: sticky Add to cart whenever the real buttons are out of view', () => {
    const product = read('components/aliexpress-product.tsx')
    assert.match(product, /<StickyBuyBar watch="\.aliBuyRow"/)
    assert.match(product, /\{canSell && <StickyBuyBar/)
    const bar = read('components/sticky-buy-bar.tsx')
    assert.match(bar, /new IntersectionObserver/)
    // Shown whenever the real buttons are off screen -- below the first screen as well as scrolled past.
    assert.match(bar, /setShow\(!entry\.isIntersecting\)/)
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
  it('shop page: one search (the header); the sort form still sends the current search', () => {
    assert.match(css, /\.aliShopToolbar select \{ margin-inline-start: auto; \}/)
    const shop = read('components/aliexpress-shop.tsx')
    assert.match(shop, /name="q"/)
    assert.match(shop, /onChange=\{e => e\.currentTarget\.form\?\.submit\(\)\}/)
  })
  it('cart drawer buttons are thumb-sized', () => {
    const nav = read('components/store-nav-fixed.tsx')
    assert.match(nav, /\.focalCartQty button\{width:36px;height:36px;/)
    assert.match(nav, /\.focalCartDeleteBtn\{[^}]*min-width:40px;min-height:40px/)
  })
  it('product page, phones: search becomes a button and the photos can be swiped', () => {
    const nav = read('components/store-nav-fixed.tsx')
    assert.match(nav, /pathname\.startsWith\('\/product\/'\) \? ' mkHeaderProduct'/)
    assert.match(css, /\.mkHeaderProduct \.aliNavSearchWrap \{ display: none !important; \}/)
    assert.match(css, /\.mkHeaderProduct \.aliNavSearchIconMobile \{ display: inline-flex !important; \}/)
    const product = read('components/aliexpress-product.tsx')
    assert.match(product, /onTouchStart=\{e => \{ swipeStart\.current =/)
    assert.match(product, /document\.documentElement\.dir === 'rtl'/)
    assert.match(css, /\.aliProductMainImage \{ touch-action: pan-y; \}/)
  })
})
