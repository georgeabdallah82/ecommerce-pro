import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Admin > Discounts, gift cards and customer segments (docs/admin-discounts-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')

test('every create or edit form is a modal dialog named by its heading', () => {
  const cases: [string, string[]][] = [
    ['coupons-admin-pro', ['discount-dialog-title']],
    ['gift-cards-admin', ['gift-card-create-title', 'gift-card-manage-title']],
    ['customer-segments-admin', ['segment-create-title']],
  ]
  for (const [file, ids] of cases) {
    const src = read(`components/${file}.tsx`)
    assert.match(src, /useModalFocus\(/, file)
    assert.doesNotMatch(src, / autoFocus/, `${file}: autoFocus took focus before the dialog noted its opener`)
    for (const id of ids) {
      assert.match(src, new RegExp(`role="dialog" aria-modal="true" aria-labelledby="${id}"`), `${file} ${id}`)
      assert.match(src, new RegExp(`<h2 id="${id}"`), `${file} ${id}`)
    }
  }
})

test('lists: named action columns, level-2 empty states, named filters and search', () => {
  for (const file of ['coupons-admin-pro', 'gift-cards-admin', 'customer-segments-admin']) {
    const src = read(`components/${file}.tsx`)
    assert.doesNotMatch(src, /<th><\/th>|<h3>/, file)
    assert.match(src, /<span className=\{ui\.srOnly\}>Actions<\/span>/, file)
  }
  assert.match(read('components/coupons-admin-pro.tsx'), /aria-label="Clear search"/)
  assert.match(read('components/coupons-admin-pro.tsx'), /aria-label="Discount status"/)
  assert.match(read('components/gift-cards-admin.tsx'), /aria-label="Gift card status"/)
})
