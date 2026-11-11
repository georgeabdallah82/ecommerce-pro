import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { collectionReadiness, priceProblem, productReadiness, summarizeReadiness, type ProductForReadiness } from '@/lib/editor-readiness'

const product = (over: Partial<ProductForReadiness> = {}): ProductForReadiness => ({
  name: 'Olive oil', sku: 'OIL-1', basePrice: 1250, compareAtPrice: null, description: 'Cold pressed', shortDescription: null,
  status: 'ACTIVE', images: [{}], seoTitle: null, seoDescription: 'Cold pressed olive oil', collectionCount: 1, publishedChannels: 1, ...over,
})
const byId = (checks: { id: string; status: string }[]) => Object.fromEntries(checks.map(c => [c.id, c.status]))

describe('priceProblem', () => {
  it('accepts a crossed-out price above the price, or none at all', () => {
    assert.equal(priceProblem(1000, 1500), '')
    assert.equal(priceProblem(1000, null), '')
    assert.equal(priceProblem(1000, 0), '')
  })
  it('rejects a crossed-out price that is not higher than the price', () => {
    assert.match(priceProblem(1000, 1000), /must be higher/)
    assert.match(priceProblem(1000, 900), /must be higher/)
  })
})

describe('productReadiness', () => {
  it('is fully ready for a complete active product', () => {
    const checks = productReadiness(product())
    assert.ok(checks.every(c => c.status === 'ok'), JSON.stringify(checks))
    assert.deepEqual(summarizeReadiness(checks), { blocks: 0, warnings: 0, ready: true })
  })
  it('blocks a missing title, SKU, or a broken crossed-out price', () => {
    const checks = byId(productReadiness(product({ name: ' ', sku: '', basePrice: 1000, compareAtPrice: 900 })))
    assert.equal(checks.title, 'block')
    assert.equal(checks.sku, 'block')
    assert.equal(checks['price-rule'], 'block')
  })
  it('warns about photos, description, collections and search text', () => {
    const checks = byId(productReadiness(product({ images: [], description: '', shortDescription: '', collectionCount: 0, seoDescription: '' })))
    assert.equal(checks.photo, 'warn')
    assert.equal(checks.description, 'warn')
    assert.equal(checks.collection, 'warn')
    assert.equal(checks.seo, 'warn')
  })
  it('explains draft and archived status', () => {
    assert.equal(byId(productReadiness(product({ status: 'DRAFT' }))).status, 'warn')
    assert.equal(byId(productReadiness(product({ status: 'ARCHIVED' }))).status, 'block')
  })
  it('warns when an active product is on no sales channel', () => {
    assert.equal(byId(productReadiness(product({ publishedChannels: 0 }))).status, 'warn')
  })
  it('warns that a zero price is shown as free', () => {
    assert.equal(byId(productReadiness(product({ basePrice: 0 }))).price, 'warn')
  })
})

describe('collectionReadiness', () => {
  const ready = { name: 'Summer', slug: 'summer', description: 'Light things', imageUrl: '/s.jpg', isActive: true, products: [{ status: 'ACTIVE' }], seoDescription: 'Light summer picks' }
  it('is ready for an active collection with active products', () => {
    assert.ok(collectionReadiness(ready).every(c => c.status === 'ok'))
  })
  it('warns when the collection is hidden or empty', () => {
    const checks = byId(collectionReadiness({ ...ready, isActive: false, products: [] }))
    assert.equal(checks.visibility, 'warn')
    assert.equal(checks.products, 'warn')
  })
  it('counts products that are not active', () => {
    const checks = collectionReadiness({ ...ready, products: [{ status: 'ACTIVE' }, { status: 'DRAFT' }] })
    const products = checks.find(c => c.id === 'products')!
    assert.equal(products.status, 'warn')
    assert.match(products.detail, /1 product is not active/)
  })
  it('blocks a collection with no name or address', () => {
    const checks = byId(collectionReadiness({ ...ready, name: '', slug: '' }))
    assert.equal(checks.name, 'block')
    assert.equal(checks.handle, 'block')
  })
})

describe('collectionReadiness search listing', () => {
  it('asks for a search description', () => {
    const checks = byId(collectionReadiness({ name: 'Summer', slug: 'summer', description: 'x', imageUrl: '/s.jpg', isActive: true, products: [{ status: 'ACTIVE' }], seoDescription: '  ' }))
    assert.equal(checks.seo, 'warn')
  })
})
