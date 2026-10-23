import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { feedCategories, feedTitle, plainText, productFeedXml } from '@/lib/product-feed'

const store = { name: 'Yalla Haul', url: 'https://shop.example', currency: 'USD' }
const base = { id: 'p1', name: 'Baloo tissues', slug: 'baloo-tissues', basePrice: 450, soldOut: false, images: [{ url: '/api/media/1.webp' }, { url: 'https://cdn.example/2.jpg' }] }

describe('product feed', () => {
  it('lists products with the pixel id, link, absolute images, price and stock', () => {
    const out = productFeedXml([{ ...base, description: '<p>Soft &amp; strong</p>', brand: 'Baloo' }], store)
    for (const part of ['<g:id>p1</g:id>', '<g:title>Baloo tissues</g:title>', '<g:description>Soft &amp; strong</g:description>',
      '<g:link>https://shop.example/product/baloo-tissues</g:link>', '<g:image_link>https://shop.example/api/media/1.webp</g:image_link>',
      '<g:additional_image_link>https://cdn.example/2.jpg</g:additional_image_link>', '<g:availability>in stock</g:availability>',
      '<g:price>4.50 USD</g:price>', '<g:brand>Baloo</g:brand>', '<g:condition>new</g:condition>']) assert.ok(out.includes(part), part)
    assert.ok(!out.includes('sale_price'))
  })
  it('shows a sale, sold-out stock and falls back to the store as brand', () => {
    const out = productFeedXml([{ ...base, compareAtPrice: 600, soldOut: true }], store)
    assert.ok(out.includes('<g:price>6.00 USD</g:price>') && out.includes('<g:sale_price>4.50 USD</g:sale_price>'))
    assert.ok(out.includes('<g:availability>out of stock</g:availability>') && out.includes('<g:brand>Yalla Haul</g:brand>'))
  })
  it('skips products without a usable photo and escapes text', () => {
    const out = productFeedXml([{ ...base, images: [{ url: '/logo.svg' }] }, { ...base, id: 'p2', name: 'Cups <6 pack> & "more"' }], store)
    assert.ok(!out.includes('<g:id>p1</g:id>') && out.includes('<g:title>Cups &lt;6 pack&gt; &amp; &quot;more&quot;</g:title>'))
  })
  it('sends the store categories so Meta can group products for ads', () => {
    const categories = feedCategories([
      { collection: { name: 'Personal Care', isActive: true, sortOrder: 2 } },
      { collection: { name: 'Hidden', isActive: false, sortOrder: 0 } },
      { collection: { name: 'Kitchen & Home', isActive: true, sortOrder: 1 } },
    ])
    assert.deepEqual(categories, ['Kitchen & Home', 'Personal Care'])
    const out = productFeedXml([{ ...base, categories }], store)
    assert.ok(out.includes('<g:product_type>Kitchen &amp; Home, Personal Care</g:product_type>'))
    assert.ok(out.includes('<g:custom_label_0>Kitchen &amp; Home</g:custom_label_0>'))
    assert.ok(!productFeedXml([base], store).includes('product_type'), 'no category: no empty tag')
  })
  it('turns descriptions into plain text', () => {
    assert.equal(plainText('<h2>Size</h2><p>Big&nbsp;one<br>Two</p><script>x()</script>'), 'Size\nBig one\nTwo')
  })

  it('sends all-capital names in normal capitalisation but leaves mixed-case names alone', () => {
    assert.equal(feedTitle('CHOOSING STONEWARE BOWL BLUE'), 'Choosing Stoneware Bowl Blue')
    assert.equal(feedTitle('ARM&HAMMER PLUS OXI CLEAN STAIN FIGHTER'), 'Arm&Hammer Plus Oxi Clean Stain Fighter')
    assert.equal(feedTitle('AYL.GOODS PORCELAIN DINNER SET 2.5L'), 'Ayl.Goods Porcelain Dinner Set 2.5L')
    assert.equal(feedTitle('Joseph Joseph PowerGrip Kitchen Scissors'), 'Joseph Joseph PowerGrip Kitchen Scissors')
    assert.equal(feedTitle('METALTEX ORBIT STRG RACK 3TIER 26x27x65'), 'METALTEX ORBIT STRG RACK 3TIER 26x27x65')
    assert.equal(feedTitle('\u0645\u0646\u0638\u0641 \u0627\u0644\u0645\u0637\u0628\u062e'), '\u0645\u0646\u0638\u0641 \u0627\u0644\u0645\u0637\u0628\u062e')
    assert.ok(productFeedXml([{ ...base, name: 'CHOOSING STONEWARE BOWL BLUE' }], store).includes('<g:title>Choosing Stoneware Bowl Blue</g:title>'))
  })
})
