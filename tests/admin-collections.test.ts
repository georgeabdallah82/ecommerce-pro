import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Admin > Collections: the list and the editor (docs/admin-collections-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')
const editor = read('components/collection-editor-shopify.tsx')
const list = read('components/collections-admin-shopify.tsx')

test('the editor: one <main>, a modal Add products, the image buttons named by their own words', () => {
  assert.doesNotMatch(editor, /<main className=|<\/main>/)
  assert.match(editor, /useModalFocus\(pickerRef, pickerOpen, closePicker\)/)
  assert.match(editor, /<div ref=\{pickerRef\} className=\{`\$\{ui\.card\} \$\{s\.picker\}`\} role="dialog" aria-modal="true"/)
  assert.match(editor, /<input data-autofocus value=\{query\}/)
  assert.doesNotMatch(editor, /<label>Collection image/)
})

test('the editor says what customers see when an active collection has no active products', () => {
  assert.match(editor, /collection\.isActive && !assigned\.some\(p => p\.status === 'ACTIVE'\) && <p className=\{s\.emptyNote\}>No active products yet: it shows in the store's menus and home page, and customers who open it see an empty page\./)
})

test('the list: both dialogs are modal and named, and the actions column has a name', () => {
  assert.match(list, /useModalFocus\(addRef, addOpen, \(\) => setAddOpen\(false\)\)/)
  assert.match(list, /useModalFocus\(createRef, show, \(\) => setShow\(false\)\)/)
  assert.match(list, /ref=\{createRef\}\n\s+role="dialog"\n\s+aria-modal="true"\n\s+aria-labelledby="create-collection-title"/)
  assert.match(list, /<h2 id="create-collection-title"/)
  assert.match(list, /<th className=\{styles\.actionsHead\}><span className=\{styles\.srOnly\}>Actions<\/span><\/th>/)
})
