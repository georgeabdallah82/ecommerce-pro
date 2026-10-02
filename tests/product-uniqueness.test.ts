import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cleanBarcode, freeProductSlug, productConflict, uniqueConflictMessage, variantConflict } from '@/lib/product-uniqueness'

// A tiny stand-in client: findFirst matches on the exact fields these helpers query.
function fakeClient(products: any[], variants: any[] = []) {
  const matches = (row: any, where: any) => Object.entries(where).every(([key, cond]: [string, any]) => {
    if (key === 'NOT') return !(cond.id?.in ? cond.id.in.includes(row.id) : row.id === cond.id)
    if (cond && typeof cond === 'object' && 'in' in cond) return cond.in.includes(row[key])
    return row[key] === cond
  })
  return {
    product: { findFirst: async ({ where }: any) => products.find(p => matches(p, where)) || null },
    productVariant: { findFirst: async ({ where }: any) => variants.find(v => matches(v, where)) || null },
  } as any
}

describe('product uniqueness', () => {
  it('stores blank barcodes as null so they never clash', () => {
    assert.equal(cleanBarcode(''), null)
    assert.equal(cleanBarcode('   '), null)
    assert.equal(cleanBarcode(null), null)
    assert.equal(cleanBarcode(' 0123 '), '0123')
  })

  it('lets many products have no barcode', async () => {
    const client = fakeClient([{ id: 'a', sku: 'A', slug: 'a', barcode: null }, { id: 'b', sku: 'B', slug: 'b', barcode: null }])
    assert.equal(await productConflict(client, { sku: 'C', barcode: null }), null)
  })

  it('names the field that clashes', async () => {
    const client = fakeClient([{ id: 'a', sku: 'A', slug: 'mug', barcode: '999' }])
    assert.match(String(await productConflict(client, { sku: 'A' })), /SKU "A"/)
    assert.match(String(await productConflict(client, { sku: 'Z', barcode: '999' })), /Barcode "999"/)
    assert.match(String(await productConflict(client, { slug: 'mug' })), /URL handle "mug"/)
  })

  it("ignores the product's own values when editing it", async () => {
    const client = fakeClient([{ id: 'a', sku: 'A', slug: 'mug', barcode: '999' }])
    assert.equal(await productConflict(client, { sku: 'A', barcode: '999', slug: 'mug' }, 'a'), null)
  })

  it("checks variants against other products' variants only", async () => {
    const client = fakeClient([], [{ id: 'v1', sku: 'MUG-RED', barcode: '111' }, { id: 'v9', sku: 'CUP-1', barcode: '222' }])
    assert.equal(await variantConflict(client, [{ id: 'v1', sku: 'MUG-RED', barcode: '111' }]), null)
    assert.equal(await variantConflict(client, [{ sku: 'MUG-RED', barcode: null }], ['v1']), null)
    assert.match(String(await variantConflict(client, [{ sku: 'CUP-1', barcode: null }])), /Variant SKU "CUP-1"/)
    assert.match(String(await variantConflict(client, [{ sku: 'NEW', barcode: '222' }])), /Variant barcode "222"/)
  })

  it('gives a repeated product name the next free URL handle', async () => {
    assert.equal(await freeProductSlug(fakeClient([]), 'red-mug'), 'red-mug')
    assert.equal(await freeProductSlug(fakeClient([{ id: 'a', slug: 'red-mug' }, { id: 'b', slug: 'red-mug-2' }]), 'red-mug'), 'red-mug-3')
  })

  it('turns database unique errors into a readable message', () => {
    const error = Object.assign(new Error('Unique constraint failed on the constraint: `Product_barcode_key`'), { meta: { target: 'Product_barcode_key' } })
    assert.equal(uniqueConflictMessage(error), 'That barcode is already used by another product.')
    assert.equal(uniqueConflictMessage(new Error('Unique constraint failed on the constraint: `Product_slug_key`')), 'That URL handle is already used by another product.')
    assert.equal(uniqueConflictMessage(new Error('something else')), null)
  })
})
