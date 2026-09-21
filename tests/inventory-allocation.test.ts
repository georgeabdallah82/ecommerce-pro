import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reserveStock, releaseReservedQuantity, pickMajorityLocation } from '@/lib/inventory'

// A minimal in-memory stand-in for the slice of the Prisma transaction client
// that reserveStock/releaseReservedQuantity actually use. It mirrors Prisma's
// conditional-updateMany semantics (the where clause must still match the
// row's *current* state at update time, and count reflects how many rows
// actually matched) so the race-condition-guard behavior in lib/inventory.ts
// is exercised for real rather than assumed.
function makeFakeTx(rows: Array<{ id: string; variantId: string | null; quantity: number; reserved: number }>) {
  const state = new Map(rows.map(r => [r.id, { ...r }]))
  const movements: any[] = []
  return {
    state,
    movements,
    inventoryItem: {
      async updateMany({ where, data }: any) {
        const row = state.get(where.id)
        if (!row) return { count: 0 }
        if (where.reserved?.lte !== undefined && !(row.reserved <= where.reserved.lte)) return { count: 0 }
        if (where.reserved?.gte !== undefined && !(row.reserved >= where.reserved.gte)) return { count: 0 }
        if (where.quantity?.gte !== undefined && !(row.quantity >= where.quantity.gte)) return { count: 0 }
        if (data.reserved?.increment !== undefined) row.reserved += data.reserved.increment
        if (data.reserved?.decrement !== undefined) row.reserved -= data.reserved.decrement
        if (data.quantity?.decrement !== undefined) row.quantity -= data.quantity.decrement
        return { count: 1 }
      },
    },
    inventoryMovement: {
      async create({ data }: any) {
        movements.push(data)
        return data
      },
    },
  }
}

const product = (inventory: any[], overrides: Partial<{ trackInventory: boolean; continueSellingWhenOutOfStock: boolean }> = {}) => ({
  name: 'Test Product',
  trackInventory: true,
  continueSellingWhenOutOfStock: false,
  inventory,
  ...overrides,
})

describe('lib/inventory stock allocation', () => {
  describe('reserveStock', () => {
    it('rejects a non-positive quantity', async () => {
      const tx = makeFakeTx([])
      await assert.rejects(() => reserveStock(tx, product([]), null, 0, 'ref-1'), /greater than zero/)
      await assert.rejects(() => reserveStock(tx, product([]), null, -1, 'ref-1'), /greater than zero/)
    })

    it('skips reservation entirely when the product does not track inventory', async () => {
      const tx = makeFakeTx([{ id: 'inv-1', variantId: null, quantity: 5, reserved: 0 }])
      const result = await reserveStock(tx, product([{ id: 'inv-1', variantId: null, quantity: 5, reserved: 0 }], { trackInventory: false }), null, 3, 'ref-1')
      assert.deepEqual(result, [])
      assert.equal(tx.state.get('inv-1')!.reserved, 0, 'stock should be untouched when tracking is off')
    })

    it('skips reservation entirely when overselling is explicitly allowed', async () => {
      const tx = makeFakeTx([{ id: 'inv-1', variantId: null, quantity: 5, reserved: 0 }])
      const result = await reserveStock(tx, product([{ id: 'inv-1', variantId: null, quantity: 5, reserved: 0 }], { continueSellingWhenOutOfStock: true }), null, 3, 'ref-1')
      assert.deepEqual(result, [])
      assert.equal(tx.state.get('inv-1')!.reserved, 0)
    })

    it('reserves against a single row with enough available stock', async () => {
      const invRows = [{ id: 'inv-1', variantId: null, quantity: 10, reserved: 2, locationId: 'loc-1' }]
      const tx = makeFakeTx(invRows)
      const result = await reserveStock(tx, product(invRows), null, 5, 'ref-1')
      assert.deepEqual(result, [{ inventoryId: 'inv-1', quantity: 5, locationId: 'loc-1' }])
      assert.equal(tx.state.get('inv-1')!.reserved, 7)
      assert.equal(tx.movements.length, 1)
      assert.equal(tx.movements[0].type, 'SALE_RESERVATION')
    })

    it('prefers the variant-specific row over the shared pool when both exist', async () => {
      const invRows = [
        { id: 'shared', variantId: null, quantity: 100, reserved: 0 },
        { id: 'variant-a', variantId: 'v-a', quantity: 3, reserved: 0 },
      ]
      const tx = makeFakeTx(invRows)
      const result = await reserveStock(tx, product(invRows), 'v-a', 2, 'ref-1')
      assert.deepEqual(result, [{ inventoryId: 'variant-a', quantity: 2, locationId: null }])
      assert.equal(tx.state.get('shared')!.reserved, 0, 'the shared pool must not be touched when a dedicated variant row exists')
    })

    it('falls back to the shared pool when the variant has no dedicated row', async () => {
      const invRows = [{ id: 'shared', variantId: null, quantity: 10, reserved: 0 }]
      const tx = makeFakeTx(invRows)
      const result = await reserveStock(tx, product(invRows), 'v-missing', 4, 'ref-1')
      assert.deepEqual(result, [{ inventoryId: 'shared', quantity: 4, locationId: null }])
    })

    it('prefers a single location that alone can cover the full quantity over splitting, even when a smaller row is listed first', async () => {
      // Without preferring the largest-available row first, the old (DB-order) behavior would
      // have reserved 2 from 'small' then the remaining 3 from 'big' -- silently splitting one
      // line item across two physical locations even though 'big' alone could have covered it.
      const invRows = [
        { id: 'small', variantId: null, quantity: 2, reserved: 0, locationId: 'loc-small' },
        { id: 'big', variantId: null, quantity: 20, reserved: 0, locationId: 'loc-big' },
      ]
      const tx = makeFakeTx(invRows)
      const result = await reserveStock(tx, product(invRows), null, 5, 'ref-1')
      assert.deepEqual(result, [{ inventoryId: 'big', quantity: 5, locationId: 'loc-big' }])
      assert.equal(tx.state.get('big')!.reserved, 5)
      assert.equal(tx.state.get('small')!.reserved, 0, 'the smaller row should be untouched when the larger one alone covers the order')
    })

    it('splits a reservation across multiple rows when no single row has enough, largest-available first', async () => {
      const invRows = [
        { id: 'inv-1', variantId: null, quantity: 3, reserved: 0 },
        { id: 'inv-2', variantId: null, quantity: 5, reserved: 0 },
      ]
      const tx = makeFakeTx(invRows)
      const result = await reserveStock(tx, product(invRows), null, 6, 'ref-1')
      assert.deepEqual(result, [
        { inventoryId: 'inv-2', quantity: 5, locationId: null },
        { inventoryId: 'inv-1', quantity: 1, locationId: null },
      ])
      assert.equal(tx.state.get('inv-1')!.reserved, 1)
      assert.equal(tx.state.get('inv-2')!.reserved, 5)
    })

    it('throws and reserves nothing further once stock across all rows is exhausted', async () => {
      const invRows = [{ id: 'inv-1', variantId: null, quantity: 4, reserved: 0 }]
      const tx = makeFakeTx(invRows)
      await assert.rejects(() => reserveStock(tx, product(invRows), null, 10, 'ref-1'), /Not enough stock/)
      // the 4 units that WERE available still got reserved before the shortfall was detected
      assert.equal(tx.state.get('inv-1')!.reserved, 4)
    })

    it('recovers from a lost race on one row by reserving the shortfall from the next row', async () => {
      // Simulates a concurrent checkout stealing inv-1's stock between this
      // function reading `row.reserved` and issuing its conditional update:
      // the where clause's `reserved: { lte }` guard should make the update
      // for inv-1 a no-op (count 0), and the loop should recover by pulling
      // the remaining quantity from inv-2 instead of silently under-reserving.
      const invRows = [
        { id: 'inv-1', variantId: null, quantity: 10, reserved: 0 },
        { id: 'inv-2', variantId: null, quantity: 10, reserved: 0 },
      ]
      const tx = makeFakeTx(invRows)
      const realUpdateMany = tx.inventoryItem.updateMany.bind(tx.inventoryItem)
      let firstCall = true
      tx.inventoryItem.updateMany = async (args: any) => {
        if (firstCall && args.where.id === 'inv-1') {
          firstCall = false
          // simulate another transaction having already reserved inv-1's stock
          tx.state.get('inv-1')!.reserved = 10
          return { count: 0 }
        }
        return realUpdateMany(args)
      }
      const result = await reserveStock(tx, product(invRows), null, 5, 'ref-1')
      assert.deepEqual(result, [{ inventoryId: 'inv-2', quantity: 5, locationId: null }])
      assert.equal(tx.state.get('inv-2')!.reserved, 5)
    })
  })

  describe('pickMajorityLocation', () => {
    it('returns null for an empty or all-null list', () => {
      assert.equal(pickMajorityLocation([]), null)
      assert.equal(pickMajorityLocation([{ locationId: null }, { locationId: null }]), null)
    })

    it('returns the only location when every row shares it', () => {
      assert.equal(pickMajorityLocation([{ locationId: 'loc-a' }, { locationId: 'loc-a' }]), 'loc-a')
    })

    it('returns whichever location appears most often when a shipment had to split across locations', () => {
      const rows = [{ locationId: 'loc-a' }, { locationId: 'loc-b' }, { locationId: 'loc-b' }, { locationId: null }]
      assert.equal(pickMajorityLocation(rows), 'loc-b')
    })
  })

  describe('releaseReservedQuantity', () => {
    it('is a no-op for a non-positive quantity', async () => {
      const tx = makeFakeTx([{ id: 'inv-1', variantId: null, quantity: 10, reserved: 5 }])
      const result = await releaseReservedQuantity(tx, product([]), null, 0, 'ref-1')
      assert.deepEqual(result, [])
    })

    it('releases up to the requested quantity from a row\'s reserved pool', async () => {
      const invRows = [{ id: 'inv-1', variantId: null, quantity: 10, reserved: 6 }]
      const tx = makeFakeTx(invRows)
      const result = await releaseReservedQuantity(tx, product(invRows), null, 4, 'ref-1')
      assert.deepEqual(result, [{ inventoryId: 'inv-1', quantity: 4 }])
      assert.equal(tx.state.get('inv-1')!.reserved, 2)
    })

    it('never releases more than is actually reserved on a row', async () => {
      const invRows = [{ id: 'inv-1', variantId: null, quantity: 10, reserved: 2 }]
      const tx = makeFakeTx(invRows)
      const result = await releaseReservedQuantity(tx, product(invRows), null, 5, 'ref-1')
      assert.deepEqual(result, [{ inventoryId: 'inv-1', quantity: 2 }])
      assert.equal(tx.state.get('inv-1')!.reserved, 0)
    })

    it('does nothing when the product does not track inventory', async () => {
      const invRows = [{ id: 'inv-1', variantId: null, quantity: 10, reserved: 5 }]
      const tx = makeFakeTx(invRows)
      const result = await releaseReservedQuantity(tx, product(invRows, { trackInventory: false }), null, 4, 'ref-1')
      assert.deepEqual(result, [])
      assert.equal(tx.state.get('inv-1')!.reserved, 5)
    })
  })
})
