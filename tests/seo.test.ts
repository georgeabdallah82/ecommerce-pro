import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fromPrice, isShareableImage, metaText, productShareText, shareMeta, sharePrice } from '@/lib/seo'
import { fitWithin } from '@/lib/optimize-image'

describe('lib/seo', () => {
  it('turns HTML and placeholders into clean meta descriptions', () => {
    assert.equal(metaText('0'), undefined)
    assert.equal(metaText(' - '), undefined)
    assert.equal(metaText(null), undefined)
    assert.equal(metaText('<p>Soft   tissues,&nbsp;<b>3-ply</b></p>'), 'Soft tissues, 3-ply')
    const long = metaText('word '.repeat(80))!
    assert.ok(long.length <= 160 && long.endsWith('…'))
  })

  it('only offers raster images for share previews (WhatsApp/Facebook ignore SVG)', () => {
    assert.equal(isShareableImage('/api/media/logo.svg'), false)
    assert.equal(isShareableImage('data:image/png;base64,AAA'), false)
    assert.equal(isShareableImage(''), false)
    assert.equal(isShareableImage('/api/media/1788990274617-r2eksv.png'), true)
    assert.equal(isShareableImage('https://cdn.example.com/a.webp?v=2'), true)
  })
})

describe('lib/optimize-image', () => {
  it('fits big photos inside 1600px without upscaling small ones', () => {
    assert.deepEqual(fitWithin(4032, 3024), { width: 1600, height: 1200 })
    assert.deepEqual(fitWithin(1200, 3000), { width: 640, height: 1600 })
    assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 })
  })
})

describe('lib/seo: shared product links', () => {
  it('shows the price in the store currency', () => {
    assert.equal(sharePrice(3900, 'USD'), '$39.00')
    assert.equal(sharePrice(1250, 'usd'), '$12.50')
    assert.equal(sharePrice(-5, 'USD'), '$0.00')
    assert.equal(sharePrice(500, 'NOPE'), '5.00 NOPE', 'an unknown currency still gives a readable price')
  })

  it('uses the lowest option price as the "from" price', () => {
    assert.equal(fromPrice(3900), 3900)
    assert.equal(fromPrice(3900, []), 3900)
    assert.equal(fromPrice(3900, [{ price: null }, { price: undefined }]), 3900)
    assert.equal(fromPrice(3900, [{ price: 4500 }, { price: null }, { price: 2900 }]), 2900)
  })

  it('puts the price and stock first in the title and the description', () => {
    const t = productShareText({ name: 'Essential Starter Kit', description: 'Thoughtfully selected essentials with a clean, premium presentation.', cents: 3900, currency: 'USD', soldOut: false })
    assert.equal(t.title, 'Essential Starter Kit · $39.00')
    assert.equal(t.description, '$39.00 · In stock. Thoughtfully selected essentials with a clean, premium presentation.')
    assert.equal(t.stock, 'In stock')
  })

  it('says when it is out of stock and shows the old price on a sale', () => {
    const t = productShareText({ name: 'Bowl', description: 'Blue stoneware.', cents: 299, compareAtCents: 499, currency: 'USD', soldOut: true })
    assert.equal(t.description, '$2.99 (was $4.99) · Out of stock. Blue stoneware.')
    assert.equal(productShareText({ name: 'Bowl', cents: 299, compareAtCents: 299, currency: 'USD', soldOut: false }).description.includes('was'), false, 'no "was" when the prices are equal')
  })

  it('falls back to a plain sentence without a description, keeps a long text short, and does not repeat a price in the name', () => {
    assert.equal(productShareText({ name: 'Kit', cents: 1000, currency: 'USD', soldOut: false }).description, '$10.00 · In stock. Buy Kit online with fast delivery.')
    const long = productShareText({ name: 'Kit', description: 'word '.repeat(100), cents: 1000, currency: 'USD', soldOut: false }).description
    assert.ok(long.length <= 200 && long.endsWith('…'), long.length + '')
    assert.equal(productShareText({ name: 'Kit $10.00', cents: 1000, currency: 'USD', soldOut: false }).title, 'Kit $10.00')
  })

  it('says pre-order, not in stock, for a sold-out product that still takes pre-orders', () => {
    const t = productShareText({ name: 'Lamp', description: 'Hand-blown glass.', cents: 2500, currency: 'USD', soldOut: false, preorder: true })
    assert.equal(t.stock, 'Pre-order')
    assert.equal(t.description, '$25.00 · Pre-order. Hand-blown glass.')
  })

  it('can leave og:type out so the product page writes its own', () => {
    assert.equal(shareMeta({ title: 'T', url: 'https://x.example/p' }).openGraph.type, 'website')
    assert.equal('type' in shareMeta({ title: 'T', url: 'https://x.example/p', type: null }).openGraph, false)
  })

  it('is wired into the product page: price and stock in the preview, product tags in the head', () => {
    const page = readFileSync('app/product/[slug]/page.tsx', 'utf8')
    assert.match(page, /productShareText\(\{/)
    assert.match(page, /shareMeta\(\{ title: share\.title, description: share\.description, url, type: null,/)
    assert.match(page, /<meta property="og:type" content="product" \/>/)
    assert.match(page, /<meta property="product:price:amount"/)
    assert.match(page, /<meta property="product:availability" content=\{availability\} \/>/)
    assert.match(page, /<ProductShareTags cents=\{fromPrice\(product\.basePrice, product\.variants\)\}/)
    assert.match(page, /availability=\{SHARE_AVAILABILITY\[productState\]\}/)
    // Search results keep the plain title and description.
    assert.match(page, /\n    title,\n    description,\n    alternates: \{ canonical: url \},/)
  })
})

