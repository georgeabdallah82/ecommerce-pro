import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Admin > Customers (docs/admin-customers-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')

test('the list: Add customer is a modal dialog named by its heading; the actions column has a name', () => {
  const list = read('components/customers-admin.tsx')
  assert.match(list, /useModalFocus\(createRef, showCreate, \(\) => setShowCreate\(false\)\)/)
  assert.match(list, /<div ref=\{createRef\} role="dialog" aria-modal="true" aria-labelledby="add-customer-title"/)
  assert.match(list, /<h2 id="add-customer-title" className="h3">Add customer<\/h2>/)
  assert.match(list, /<th style=\{\{ position: 'relative' \}\}><span className=\{ui\.srOnly\}>Actions<\/span><\/th>/)
})

test('a customer\'s page: one <main>, and the segment picker is named', () => {
  const detail = read('components/customer-detail-admin.tsx')
  assert.doesNotMatch(detail, /<main className=|<\/main>/)
  assert.match(detail, /aria-label="Segment to add this customer to"/)
})
