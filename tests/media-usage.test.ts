import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findMediaUsage, mediaBucketKey, mediaSearchTerm } from '@/lib/media-usage'

// Minimal stand-in for the Prisma models findMediaUsage reads, honouring {contains} and OR.
function fakeClient(data: Record<string, any[]>) {
  const matches = (row: any, where: any): boolean => {
    if (where.OR) return where.OR.some((w: any) => matches(row, w))
    return Object.entries(where).every(([field, cond]: any) => typeof row[field] === 'string' && row[field].includes(cond.contains))
  }
  const model = (rows: any[]) => ({ findMany: async ({ where }: any) => rows.filter(r => matches(r, where)) })
  return {
    productImage: model(data.productImage || []),
    product: model(data.product || []),
    collection: model(data.collection || []),
    blogPost: model(data.blogPost || []),
    page: model(data.page || []),
    setting: model(data.setting || []),
  }
}

describe('media usage', () => {
  it('matches uploaded files by their key wherever the address was pasted', () => {
    assert.equal(mediaSearchTerm('/api/media/123-abc.webp'), '123-abc.webp')
    assert.equal(mediaSearchTerm('https://shop.example/api/media/123-abc.webp'), '123-abc.webp')
    assert.equal(mediaSearchTerm('https://cdn.example/banner.jpg'), 'https://cdn.example/banner.jpg')
    assert.equal(mediaBucketKey('/api/media/123-abc.webp'), '123-abc.webp')
    assert.equal(mediaBucketKey('https://cdn.example/banner.jpg'), null)
  })

  it('lists every place the file is shown', async () => {
    const url = '/api/media/111-logo.webp'
    const client = fakeClient({
      productImage: [{ url: 'https://shop.example/api/media/111-logo.webp', product: { name: 'Baloo tissues' } }, { url: '/api/media/222-other.webp', product: { name: 'Soap' } }],
      collection: [{ name: 'Personal care', imageUrl: url, description: '' }],
      blogPost: [{ title: 'Launch', featuredImage: null, bodyHtml: `<img src="${url}">` }],
      setting: [{ key: 'theme.sections', value: JSON.stringify([{ image: url }]) }, { key: 'store.logoUrl', value: url }, { key: 'theme.draft.sections', value: url }],
    })
    assert.deepEqual(await findMediaUsage(url, client), [
      'Product: Baloo tissues',
      'Collection: Personal care',
      'Blog post: Launch',
      'Your live theme (homepage, banners or sections)',
      'Store logo or icon',
      'Theme editor (unpublished changes)',
    ])
  })

  it('reports nothing for an unused file', async () => {
    assert.deepEqual(await findMediaUsage('/api/media/999-unused.webp', fakeClient({ product: [{ name: 'Soap', seoImageUrl: '/api/media/1.webp', description: '' }] })), [])
  })
})
