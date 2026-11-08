import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { addToTill, availableStock, findByCode, searchItems, setQuantity, tillItems, tillTotals, type TillLine, type StockRow } from '../lib/pos-till'

const products = [
  { id: 'p1', title: 'Tissue box', sku: 'TIS-1', barcode: '6291000000011', basePrice: 450, variants: [] },
  {
    id: 'p2', title: 'Shampoo', sku: 'SHA', barcode: null, basePrice: 800,
    variants: [
      { id: 'v1', title: '400 ml', sku: 'SHA-400', barcode: '6291000000028', price: 700 },
      { id: 'v2', title: '1 L', sku: 'SHA-1L', barcode: null, price: null },
    ],
  },
]
const stock: StockRow[] = [
  { productId: 'p1', variantId: null, quantity: 10, reserved: 3 },
  { productId: 'p2', variantId: 'v1', quantity: 2, reserved: 0 },
  { productId: 'p2', variantId: 'v1', quantity: 1, reserved: 0 },
  { productId: 'p2', variantId: 'v2', quantity: 0, reserved: 0 },
]
const items = tillItems(products, stock)
const byKey = (key: string) => items.find(item => item.key === key)!

describe('till items', () => {
  it('makes one item per product without variants and one per variant otherwise', () => {
    assert.deepEqual(items.map(item => item.key), ['p1:', 'p2:v1', 'p2:v2'])
  })

  it('prices a variant at its own price, falling back to the product base price', () => {
    assert.equal(byKey('p1:').unitPrice, 450)
    assert.equal(byKey('p2:v1').unitPrice, 700)
    assert.equal(byKey('p2:v2').unitPrice, 800)
  })

  it('names a variant after its product', () => {
    assert.equal(byKey('p2:v1').title, 'Shampoo · 400 ml')
    assert.equal(byKey('p1:').title, 'Tissue box')
  })

  it('counts stock as on hand minus reserved, summed over locations', () => {
    assert.equal(availableStock(stock, 'p1', null), 7)
    assert.equal(availableStock(stock, 'p2', 'v1'), 3)
    assert.equal(availableStock(stock, 'p2', 'v2'), 0)
    assert.equal(byKey('p2:v1').available, 3)
  })

  it('never reports negative stock when more is reserved than on hand', () => {
    assert.equal(availableStock([{ productId: 'x', variantId: null, quantity: 1, reserved: 4 }], 'x', null), 0)
  })
})

describe('scanning and searching', () => {
  it('finds an item by exact barcode or SKU, ignoring case and spaces', () => {
    assert.equal(findByCode(items, '6291000000011')?.key, 'p1:')
    assert.equal(findByCode(items, ' sha-400 ')?.key, 'p2:v1')
    assert.equal(findByCode(items, '6291000000028')?.key, 'p2:v1')
  })

  it('does not match a partial code when scanning', () => {
    assert.equal(findByCode(items, '629100'), null)
    assert.equal(findByCode(items, ''), null)
  })

  it('searches by every word typed, matching title, SKU or barcode', () => {
    assert.deepEqual(searchItems(items, 'shampoo 400').map(item => item.key), ['p2:v1'])
    assert.deepEqual(searchItems(items, 'tissue').map(item => item.key), ['p1:'])
    assert.deepEqual(searchItems(items, 'SHA').map(item => item.key), ['p2:v2', 'p2:v1'])
    assert.deepEqual(searchItems(items, '   '), [])
  })
})

describe('cart', () => {
  const tissue = byKey('p1:')

  it('adds an item, then increases its quantity', () => {
    let lines: TillLine[] = addToTill([], tissue)
    lines = addToTill(lines, tissue, 2)
    assert.equal(lines.length, 1)
    assert.equal(lines[0].quantity, 3)
  })

  it('never lets a line exceed the stock available now', () => {
    const lines = addToTill([], byKey('p2:v1'), 10)
    assert.equal(lines[0].quantity, 3)
    assert.equal(addToTill(lines, byKey('p2:v1')), lines)
  })

  it('does not add an out-of-stock item', () => {
    assert.deepEqual(addToTill([], byKey('p2:v2')), [])
  })

  it('removes a line when its quantity goes to zero, and caps it at stock', () => {
    let lines = addToTill([], tissue, 2)
    lines = setQuantity(lines, 'p1:', 99)
    assert.equal(lines[0].quantity, 7)
    lines = setQuantity(lines, 'p1:', 0)
    assert.deepEqual(lines, [])
  })

  it('totals units and the amount in cents', () => {
    let lines = addToTill([], tissue, 2)
    lines = addToTill(lines, byKey('p2:v1'), 1)
    assert.deepEqual(tillTotals(lines), { units: 3, subtotal: 2 * 450 + 700 })
    assert.deepEqual(tillTotals([]), { units: 0, subtotal: 0 })
  })
})
