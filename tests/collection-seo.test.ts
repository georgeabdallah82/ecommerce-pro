import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COLLECTION_LIST_LIMIT, collectionListJsonLd, collectionSeo } from '@/lib/collection-seo'

describe('lib/collection-seo collectionSeo', () => {
  it('uses the search title and description the merchant wrote', () => {
    assert.deepEqual(
      collectionSeo({ name: 'Best Sellers', description: 'Our most popular essentials', seoTitle: '  Summer   picks ', seoDescription: 'Light things for hot days' }, 'Yalla'),
      { title: 'Summer picks', description: 'Light things for hot days' },
    )
  })

  it('falls back to the name and description when no search text is set', () => {
    assert.deepEqual(
      collectionSeo({ name: 'Best Sellers', description: 'Our most popular essentials', seoTitle: '   ', seoDescription: null }, 'Yalla'),
      { title: 'Best Sellers', description: 'Our most popular essentials' },
    )
  })

  it('writes a shop line when there is no usable description', () => {
    assert.equal(collectionSeo({ name: 'Featured', description: '0' }, 'Yalla').description, 'Shop Featured at Yalla.')
    assert.equal(collectionSeo({ name: 'Featured' }, null).description, 'Shop Featured at our store.')
  })

  it('keeps a long search description to one snippet', () => {
    const description = collectionSeo({ name: 'Sale', seoDescription: 'word '.repeat(80) }).description ?? ''
    assert.ok(description.length <= 160, `too long: ${description.length}`)
    assert.ok(description.endsWith('…'))
  })
})

describe('lib/collection-seo collectionListJsonLd', () => {
  it('lists the products in the order shown, as a collection page', () => {
    const data = collectionListJsonLd({
      name: 'Best Sellers',
      slug: 'best-sellers',
      base: 'https://shop.example',
      description: 'Light things',
      products: [{ name: 'Kit', slug: 'kit' }, { name: 'Bowl', slug: 'bowl' }],
    })
    assert.ok(data)
    assert.equal(data.url, 'https://shop.example/collections/best-sellers')
    assert.equal(data.description, 'Light things')
    assert.equal(data.mainEntity.numberOfItems, 2)
    assert.deepEqual(
      data.mainEntity.itemListElement.map(item => [item.position, item.name, item.url]),
      [[1, 'Kit', 'https://shop.example/product/kit'], [2, 'Bowl', 'https://shop.example/product/bowl']],
    )
  })

  it('returns nothing for an empty collection', () => {
    assert.equal(collectionListJsonLd({ name: 'Empty', slug: 'empty', base: 'https://shop.example', products: [] }), null)
  })

  it('caps the listed products but keeps the full count', () => {
    const products = Array.from({ length: COLLECTION_LIST_LIMIT + 5 }, (_, i) => ({ name: `Item ${i}`, slug: `item-${i}` }))
    const data = collectionListJsonLd({ name: 'Big', slug: 'big', base: 'https://shop.example', products })
    assert.ok(data)
    assert.equal(data.mainEntity.numberOfItems, COLLECTION_LIST_LIMIT + 5)
    assert.equal(data.mainEntity.itemListElement.length, COLLECTION_LIST_LIMIT)
  })
})
