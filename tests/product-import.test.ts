import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fullSizeImage, importSku, importSource, importVariants, isBlockedPage, isPublicHttpUrl, markedUpPrice, normalizeImport, parseProductHtml } from '@/lib/product-import'

describe('product import', () => {
  it('recognises the supplier and makes a SKU from the product id', () => {
    assert.deepEqual(importSource('https://www.aliexpress.com/item/1005002049812453.html?spm=x'), { source: 'aliexpress', id: '1005002049812453', host: 'www.aliexpress.com' })
    assert.equal(importSku('https://www.aliexpress.com/item/1005002049812453.html'), 'AE-1005002049812453')
    assert.equal(importSku('https://us.shein.com/Lamp-p-562726049.html'), 'SH-562726049')
    assert.equal(importSku('https://www.alibaba.com/product-detail/Soft-Tissue_1600123456789.html'), 'AB-1600123456789')
    assert.match(importSku('https://shop.example/lamp'), /^IMP-/)
  })

  it('asks for full-size photos instead of thumbnails', () => {
    assert.equal(fullSizeImage('//ae01.alicdn.com/kf/Sabc.jpg_640x640q75.jpg_.avif'), 'https://ae01.alicdn.com/kf/Sabc.jpg')
    assert.equal(fullSizeImage('https://s.alicdn.com/@sc04/kf/H123_220x220.jpg'), 'https://s.alicdn.com/@sc04/kf/H123.jpg')
    assert.equal(fullSizeImage('https://img.ltwebstatic.com/images3/2024/a_thumbnail_405x552.jpg'), 'https://img.ltwebstatic.com/images3/2024/a.jpg')
    assert.equal(fullSizeImage('data:image/png;base64,xx'), '')
    assert.equal(fullSizeImage('/img/a.jpg', 'https://shop.example/p/1'), 'https://shop.example/img/a.jpg')
  })

  it('spots the captcha pages these sites show servers', () => {
    assert.equal(isBlockedPage('<script>var url="/_____tmd_____/punish?x5secdata=1"</script>'), true)
    assert.equal(isBlockedPage('<html><a href="https://us.shein.com/risk/challenge?captcha_type=909">'), true)
    assert.equal(isBlockedPage(`<html><title>Lamp</title>${'x'.repeat(5000)}</html>`), false)
  })

  it('reads a product from structured data, then share tags', () => {
    const ld = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Desk Lamp', description: 'Warm light', image: ['https://cdn.example/a_220x220.jpg', 'https://cdn.example/b.jpg'], offers: { '@type': 'Offer', price: '12.50', priceCurrency: 'USD' } })}</script>`
    assert.deepEqual(parseProductHtml(`<html><head>${ld}</head></html>`, 'https://shop.example/lamp'), {
      title: 'Desk Lamp', description: 'Warm light', images: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'], price: 12.5, currency: 'USD', options: [], sourceUrl: 'https://shop.example/lamp',
    })
    const og = '<meta property="og:title" content="Mug &amp; Lid - AliExpress 15"><meta property="og:image" content="//cdn.example/m.jpg"><meta property="product:price:amount" content="3.2"><meta property="product:price:currency" content="usd">'
    const p = parseProductHtml(og, 'https://www.aliexpress.com/item/1.html')!
    assert.equal(p.title, 'Mug & Lid'); assert.deepEqual(p.images, ['https://cdn.example/m.jpg']); assert.equal(p.price, 3.2); assert.equal(p.currency, 'USD')
    assert.equal(parseProductHtml('<html><title>Home</title></html>', 'https://shop.example/'), null)
  })

  it('cleans what the browser button sends', () => {
    const p = normalizeImport({ title: '  Phone case | SHEIN USA ', images: ['//a.example/1.jpg', '//a.example/1.jpg', 'javascript:alert(1)', 'https://a.example/2.jpg'], price: 'US $4.99', currency: 'usd!', options: [{ name: 'Color', values: ['Red', 'Red', 'Blue'] }, { name: 'Size', values: ['One'] }], sourceUrl: 'https://us.shein.com/x-p-1.html' })
    assert.equal(p.title, 'Phone case')
    assert.deepEqual(p.images, ['https://a.example/1.jpg', 'https://a.example/2.jpg'])
    assert.equal(p.price, 4.99); assert.equal(p.currency, 'USD')
    assert.deepEqual(p.options, [{ name: 'Color', values: ['Red', 'Blue'] }]) // single-value options dropped
  })

  it('prices with the markup, ending in .99', () => {
    assert.equal(markedUpPrice(2.4, 2.5), 599)   // 6.00 → 5.99
    assert.equal(markedUpPrice(3.1, 2.5), 799)   // 7.75 → 7.99
    assert.equal(markedUpPrice(10, 1), 1001)     // never at or below cost
    assert.equal(markedUpPrice(0, 2.5), 0)
  })

  it('turns the first option into variants', () => {
    assert.deepEqual(importVariants([{ name: 'Color', values: ['Red', 'Blue'] }], 'AE-1', 599), [
      { name: 'Red', sku: 'AE-1-1', optionJson: '{"Color":"Red"}', price: 599, quantity: 0 },
      { name: 'Blue', sku: 'AE-1-2', optionJson: '{"Color":"Blue"}', price: 599, quantity: 0 },
    ])
    assert.deepEqual(importVariants([], 'AE-1', 599), [])
  })

  it('only fetches public web addresses', () => {
    assert.equal(isPublicHttpUrl('https://www.aliexpress.com/item/1.html'), true)
    for (const bad of ['http://localhost:3000/x', 'http://127.0.0.1/', 'http://192.168.1.1/', 'http://10.0.0.5/', 'file:///etc/passwd', 'http://[::1]/', 'not a url', 'http://169.254.169.254/']) assert.equal(isPublicHttpUrl(bad), false, bad)
  })
})
