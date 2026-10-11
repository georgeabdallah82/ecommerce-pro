import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COLLECTION_COLUMNS, DEFAULT_IMPORT_OPTIONS, PRODUCT_COLUMNS, parseCsv, planCollectionImport, planProductImport, readRows, summarize, toCsv,
  type CatalogLookup, type ExistingProduct, type ImportOptions,
} from '../lib/catalog-csv'

const csv = (lines: string[]) => lines.join('\n')
const products = (lines: string[]) => readRows(parseCsv(csv(lines)), PRODUCT_COLUMNS)

const cup: ExistingProduct = {
  id: 'p1', sku: 'CUP-1', name: 'Cup', slug: 'cup', status: 'ACTIVE', basePrice: 4000, compareAtPrice: null, costPrice: 1500,
  description: 'A nice cup', shortDescription: null, brand: null, vendor: null, productType: null, barcode: null,
  featured: false, trackInventory: true, continueSellingWhenOutOfStock: false, requiresShipping: true, taxable: true, giftCard: false,
  weight: null, weightUnit: null, seoTitle: null, seoDescription: null, seoImageUrl: null,
  tags: ['kitchen'], collectionIds: ['c1'], stock: { rows: 1, quantity: 10, reserved: 2 }, lowStockThreshold: 5,
}
const lookup = (extra: Partial<CatalogLookup> = {}): CatalogLookup => ({
  products: new Map([['CUP-1', cup]]),
  variants: new Map(),
  slugOwner: new Map([['cup', 'CUP-1'], ['plate', 'PLATE-9']]),
  barcodeOwner: new Map(),
  variantBarcodeOwner: new Map(),
  collections: [{ id: 'c1', name: 'Kitchenware', slug: 'kitchenware' }, { id: 'c2', name: 'New in', slug: 'new-in' }],
  ...extra,
})
const opts = (o: Partial<ImportOptions> = {}): ImportOptions => ({ ...DEFAULT_IMPORT_OPTIONS, ...o })

test('reads CSV files from Excel: byte-order mark, quotes, line breaks inside cells, empty lines', () => {
  const rows = parseCsv('﻿SKU,Name,Description\r\nA,"Cup, red","Line 1\nLine ""2"""\r\n\r\n')
  assert.deepEqual(rows, [{ SKU: 'A', Name: 'Cup, red', Description: 'Line 1\nLine "2"' }])
  assert.throws(() => parseCsv('SKU,sku\nA,B'), /appears twice/)
  assert.throws(() => parseCsv('SKU\n"A'), /never closed/)
})

test('prices are money in the plain columns and cents in the old technical ones', () => {
  const plain = products(['SKU,Price,Compare-at price', 'A,45,"1,250.50"'])
  assert.equal(plain.rows[0].values.basePrice, 4500)
  assert.equal(plain.rows[0].values.compareAtPrice, 125050)
  const legacy = products(['sku,basePrice,compareAtPrice', 'A,4500,6000'])
  assert.equal(legacy.rows[0].values.basePrice, 4500)
  assert.equal(legacy.rows[0].values.compareAtPrice, 6000)
  assert.deepEqual(products(['SKU,Price', 'A,$45.00']).rows[0].values.basePrice, 4500)
  assert.match(products(['SKU,Price', 'A,abc']).rows[0].errors[0], /not a price/)
})

test('empty cells are "not given", unknown columns are listed, and formula guards come off', () => {
  const file = products(['SKU,Name,Status,Colour,Description', "A,,draft,red,'-15% off"])
  assert.deepEqual(file.rows[0].values, { sku: 'A', status: 'DRAFT', description: '-15% off' })
  assert.deepEqual(file.ignored, ['Colour'])
  assert.ok(file.columns.has('name'), 'the column is in the file even where a cell is empty')
  assert.match(products(['SKU,Featured', 'A,maybe']).rows[0].errors[0], /Yes or No/)
})

test('updating changes only the columns in the file, and lists each change', () => {
  const plan = planProductImport(products(['SKU,Price', 'CUP-1,45.00']), lookup(), opts())
  assert.equal(plan[0].action, 'update')
  assert.deepEqual(plan[0].changes, [{ label: 'Price', from: '$40.00', to: '$45.00' }])
  const same = planProductImport(products(['SKU,Price,Name', 'CUP-1,40,Cup']), lookup(), opts())
  assert.equal(same[0].action, 'unchanged')
  // Status, tags and collections only when given; collections by name or handle.
  const more = planProductImport(products(['SKU,Status,Tags,Collections', 'CUP-1,Draft,kitchen | sale,New in | kitchenware']), lookup(), opts())
  assert.deepEqual(more[0].changes.map(c => c.label), ['Status', 'Tags', 'Collections'])
})

test('new products need a name, are saved as Draft by default, and use the file status when allowed', () => {
  const file = products(['SKU,Name,Price,Status,Stock', 'BOWL-1,Bowl,12.5,Active,7', 'BAD-1,,3,,'])
  const plan = planProductImport(file, lookup(), opts())
  assert.equal(plan[0].action, 'create')
  assert.deepEqual(plan[0].changes, [{ label: 'Price', from: '', to: '$12.50' }, { label: 'Status', from: '', to: 'Draft' }, { label: 'Stock', from: '', to: '7' }])
  assert.match(plan[0].notes[0], /Saved as Draft/)
  assert.equal(plan[1].action, 'error')
  assert.match(plan[1].errors[0], /Name is missing/)
  const live = planProductImport(file, lookup(), opts({ newAsDraft: false }))
  assert.equal(live[0].changes[1].to, 'Active')
})

test('"only add new" and "only update" skip the other rows', () => {
  const file = products(['SKU,Name,Price', 'CUP-1,Cup,45', 'BOWL-1,Bowl,12'])
  assert.deepEqual(planProductImport(file, lookup(), opts({ mode: 'new' })).map(p => p.action), ['skip', 'create'])
  assert.deepEqual(planProductImport(file, lookup(), opts({ mode: 'update' })).map(p => p.action), ['update', 'skip'])
  assert.deepEqual(summarize(planProductImport(file, lookup(), opts({ mode: 'update' }))), { create: 0, update: 1, unchanged: 0, skip: 1, error: 0 })
})

test('stock changes only when asked, never below what open orders hold, never across locations', () => {
  const file = products(['SKU,Stock', 'CUP-1,25'])
  const off = planProductImport(file, lookup(), opts())
  assert.equal(off[0].action, 'unchanged')
  assert.match(off[0].notes[0], /not applied/)
  assert.deepEqual(planProductImport(file, lookup(), opts({ updateStock: true }))[0].changes, [{ label: 'Stock', from: '10', to: '25' }])
  const tooLow = planProductImport(products(['SKU,Stock', 'CUP-1,1']), lookup(), opts({ updateStock: true }))
  assert.match(tooLow[0].errors[0], /reserved by open orders/)
  const split = lookup({ products: new Map([['CUP-1', { ...cup, stock: { rows: 2, quantity: 10, reserved: 0 } }]]) })
  assert.match(planProductImport(file, split, opts({ updateStock: true }))[0].notes[0], /split across locations/)
})

test('problems are found before anything is saved', () => {
  const plan = planProductImport(products([
    'SKU,Name,URL handle,Collections',
    ',No sku,,',
    'A-1,One,plate,',
    'B-1,Two,,Summer',
    'C-1,Three,,',
    'C-1,Three again,,',
  ]), lookup(), opts())
  assert.match(plan[0].errors[0], /SKU is missing/)
  assert.match(plan[1].errors[0], /belongs to product PLATE-9/)
  assert.match(plan[2].errors[0], /Collection not found: Summer/)
  assert.match(plan[4].errors[0], /in the file twice/)
  assert.equal(summarize(plan).error, 4)
})

test('option rows belong to a product in the store or in the same file', () => {
  const plan = planProductImport(products([
    'SKU,Name,Price,Option of SKU,Option SKU,Option name,Option values,Option price',
    'TEE-1,Tee,20,,,,,',
    ',,,TEE-1,TEE-1-M,Medium,Size:M,21',
    ',,,NOPE,NOPE-S,Small,Size:S,',
  ]), lookup(), opts())
  assert.equal(plan[1].kind, 'variant')
  assert.equal(plan[1].action, 'create')
  assert.deepEqual(plan[1].changes, [{ label: 'Option price', from: '', to: '$21.00' }])
  assert.match(plan[2].errors[0], /NOPE is not in your store/)
})

test('an export reads back as the same values', () => {
  const headers = PRODUCT_COLUMNS.map(c => c.label)
  const row: Record<string, string> = { sku: 'CUP-1', name: 'Cup, "large"', status: 'Active', basePrice: '40.00', collections: 'Kitchenware', tags: 'kitchen', description: '=1+1', featured: 'No' }
  const text = toCsv(headers, [PRODUCT_COLUMNS.map(c => row[c.key] ?? '')])
  const back = readRows(parseCsv(text), PRODUCT_COLUMNS).rows[0].values
  assert.deepEqual({ sku: back.sku, name: back.name, status: back.status, basePrice: back.basePrice, description: back.description, featured: back.featured }, { sku: 'CUP-1', name: 'Cup, "large"', status: 'ACTIVE', basePrice: 4000, description: '=1+1', featured: false })
  assert.ok(!text.split('\r\n')[1].includes(',=1+1'), 'a formula is never written as a live formula')
})

test('collections: products must exist, and only the given columns change', () => {
  const existing = new Map([['kitchenware', { id: 'c1', name: 'Kitchenware', slug: 'kitchenware', description: null, imageUrl: null, isActive: true, sortOrder: 0, productSkus: ['CUP-1'] }]])
  const file = readRows(parseCsv(csv(['Name,Visible,Product SKUs', 'Kitchenware,No,', 'Summer,,CUP-1 | GHOST-1'])), COLLECTION_COLUMNS)
  const plan = planCollectionImport(file, existing, new Set(['CUP-1']), opts())
  assert.equal(plan[0].action, 'update')
  assert.deepEqual(plan[0].changes, [{ label: 'Visible', from: 'Yes', to: 'No' }], 'an empty Product SKUs cell keeps its products')
  assert.match(plan[1].errors[0], /GHOST-1/)
})
