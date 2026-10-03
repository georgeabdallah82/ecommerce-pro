import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reserveStock, restockShippedOrder } from '@/lib/inventory'
import { canTransitionOrder } from '@/lib/orders'

// In-memory stand-in for the Prisma calls these helpers make, with Prisma's conditional
// updateMany semantics (the where clause must match the row's current state).
function fakeTx(rows: Array<{ id: string; variantId: string | null; quantity: number; reserved: number }>, movements: any[] = []) {
  const state = new Map(rows.map(r => [r.id, { ...r }]))
  return {
    state,
    movements,
    inventoryItem: {
      async updateMany({ where, data }: any) {
        const row = state.get(where.id)
        if (!row) return { count: 0 }
        if (where.reserved?.lte !== undefined && !(row.reserved <= where.reserved.lte)) return { count: 0 }
        if (where.reserved?.gte !== undefined && !(row.reserved >= where.reserved.gte)) return { count: 0 }
        if (data.reserved?.increment !== undefined) row.reserved += data.reserved.increment
        if (data.reserved?.decrement !== undefined) row.reserved -= data.reserved.decrement
        if (data.quantity?.increment !== undefined) row.quantity += data.quantity.increment
        return { count: 1 }
      },
    },
    inventoryMovement: {
      async create({ data }: any) { movements.push(data); return data },
      async findMany({ where }: any) { return movements.filter(m => m.referenceId === where.referenceId && m.type === where.type) },
    },
  }
}

describe('reserveStock', () => {
  it('gives back what it took from other rows when it runs out', async () => {
    const tx = fakeTx([{ id: 'a', variantId: null, quantity: 3, reserved: 0 }, { id: 'b', variantId: null, quantity: 5, reserved: 0 }])
    const product = { name: 'Towel', trackInventory: true, continueSellingWhenOutOfStock: false, inventory: [...tx.state.values()].map(r => ({ ...r })) }
    // Another shopper takes row b's stock after the product was read.
    tx.state.get('b')!.reserved = 5
    await assert.rejects(reserveStock(tx, product, null, 6, 'ORD-1'), /Not enough stock/)
    assert.equal(tx.state.get('a')!.reserved, 0, 'row a must not stay reserved')
    assert.deepEqual(tx.movements.map(m => m.type), ['SALE_RESERVATION', 'SALE_RELEASE'])
  })
})

describe('restockShippedOrder', () => {
  it('puts shipped units back once, minus anything a return already restocked', async () => {
    const movements = [
      { inventoryId: 'a', type: 'SALE_FULFILLMENT', quantity: 2, referenceId: 'ORD-9' },
      { inventoryId: 'b', type: 'SALE_FULFILLMENT', quantity: 3, referenceId: 'ORD-9' },
      { inventoryId: 'b', type: 'RETURN', quantity: 1, referenceId: 'ORD-9' },
      { inventoryId: 'a', type: 'SALE_FULFILLMENT', quantity: 9, referenceId: 'OTHER' },
    ]
    const tx = fakeTx([{ id: 'a', variantId: null, quantity: 10, reserved: 0 }, { id: 'b', variantId: null, quantity: 4, reserved: 0 }], movements)
    const touched = await restockShippedOrder(tx, 'ORD-9')
    assert.deepEqual(touched.sort(), ['a', 'b'])
    assert.equal(tx.state.get('a')!.quantity, 12)
    assert.equal(tx.state.get('b')!.quantity, 6)
    // Running it again adds nothing: the RETURN movements it wrote now cover what shipped.
    await restockShippedOrder(tx, 'ORD-9')
    assert.equal(tx.state.get('a')!.quantity, 12)
    assert.equal(tx.state.get('b')!.quantity, 6)
  })
})

describe('order status rules', () => {
  it('lets a shipped order be cancelled (refused or undeliverable parcel)', () => {
    assert.equal(canTransitionOrder('SHIPPED', 'CANCELLED'), true)
    assert.equal(canTransitionOrder('DELIVERED', 'CANCELLED'), false)
  })
})
