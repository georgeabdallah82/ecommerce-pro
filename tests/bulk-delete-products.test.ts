import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { deleteProductCascade } from '../lib/product-delete'

// Products list: select all / clear, then Delete removes the chosen products. Products that
// appear in past orders are kept and named back to the owner, never deleted.
const read = (file: string) => readFileSync(file, 'utf8')

function fakeClient() {
  const calls: string[] = []
  const model = (name: string) => ({
    create: async () => { calls.push(`${name}.create`) },
    deleteMany: async () => { calls.push(`${name}.deleteMany`) },
    delete: async () => { calls.push(`${name}.delete`) },
  })
  const tx = new Proxy({}, { get: (_target, name) => model(String(name)) })
  return { calls, client: { $transaction: async (fn: (t: unknown) => Promise<void>) => fn(tx) } }
}

describe('deleting a product removes everything that hangs off it', () => {
  it('writes a stock movement only for stock that was on hand, then removes the product last', async () => {
    const { calls, client } = fakeClient()
    await deleteProductCascade(client, { id: 'p1', inventory: [{ id: 'i1', quantity: 3 }, { id: 'i2', quantity: 0 }] })
    assert.equal(calls.filter(call => call === 'inventoryMovement.create').length, 1)
    assert.equal(calls.at(-1), 'product.delete')
    for (const table of ['inventoryItem', 'productImage', 'productVariant', 'productTag', 'metafieldValue', 'collectionProduct', 'review', 'wishlistItem']) {
      assert.ok(calls.includes(`${table}.deleteMany`), `${table} is cleared`)
    }
  })
})

describe('the products API bulk delete keeps products with past orders', () => {
  const route = read('app/api/admin/products/route.ts')
  it('refuses products that appear in orders and reports them back', () => {
    assert.match(route, /action === 'DELETE'/)
    assert.match(route, /orderItems\.length > 0/)
    assert.match(route, /skipped: kept\.map/)
  })
  it('caps the batch and records the action in the audit log', () => {
    assert.match(route, /Delete at most 50 products at a time/)
    assert.match(route, /'product\.bulk_deleted'/)
  })
  it('the single-product delete uses the same cascade and still refuses past-order products', () => {
    const single = read('app/api/admin/products/[id]/route.ts')
    assert.match(single, /deleteProductCascade\(db,existing\)/)
    assert.match(single, /appears in past orders and cannot be deleted/)
  })
})

describe('the products list offers select all, clear and Delete with a confirmation', () => {
  const list = read('components/admin-products-list.tsx')
  it('has select all and clear selection', () => {
    assert.match(list, /aria-label="Select all products"/)
    assert.match(list, /Clear selection/)
  })
  it('Delete asks first and sends the DELETE bulk action', () => {
    assert.match(list, /onClick=\{deleteSelected\}/)
    assert.match(list, /tone: 'danger'/)
    assert.match(list, /bulkAction: 'DELETE'/)
  })
})
