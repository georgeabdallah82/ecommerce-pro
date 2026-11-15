import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Admin > Inventory, transfers and purchase orders (docs/admin-inventory-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')

test('the inventory edit drawer is a modal dialog with focus handling', () => {
  const inventory = read('components/inventory-admin-pro.tsx')
  assert.match(inventory, /useModalFocus\(drawerRef, !!selected, closeDrawer\)/)
  assert.match(inventory, /<aside ref=\{drawerRef\} className=\{s\.drawer\} role="dialog" aria-modal="true"/)
})

test('transfers and purchase orders: one <main>, level-2 section headings, named action columns', () => {
  for (const file of ['inventory-transfer-detail', 'inventory-transfer-form', 'purchase-order-detail', 'purchase-order-form']) {
    const src = read(`components/${file}.tsx`)
    assert.doesNotMatch(src, /<main className=|<\/main>/, file)
    assert.doesNotMatch(src, /<h3>|<th \/>/, file)
  }
  for (const file of ['inventory-transfer-form', 'purchase-order-form']) {
    const src = read(`components/${file}.tsx`)
    assert.match(src, /<h2 className=\{s\.formSectionTitle\}>Items<\/h2>/, file)
    assert.match(src, /<th style=\{\{ position: 'relative' \}\}><span className=\{ui\.srOnly\}>Actions<\/span><\/th>/, file)
  }
})
