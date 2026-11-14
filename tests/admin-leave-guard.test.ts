import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

// Leaving an admin editor with unsaved changes (docs/admin-leave-warning-2026-11.md).

const read = (path: string) => readFileSync(path, 'utf8')
const guard = read('components/use-leave-guard.ts')
const link = read('components/admin-link.tsx')
const EDITORS = [
  'components/settings-center-pro.tsx',
  'components/product-editor-v2.tsx',
  'components/collection-editor-shopify.tsx',
  'components/customer-detail-admin.tsx',
  'components/policies-admin.tsx',
  'components/navigation-editor-pro.tsx',
  'components/suppliers-admin.tsx',
  'components/theme-studio.tsx',
]

test('one guard asks before leaving with unsaved changes', () => {
  // Reload, closing the tab and plain links: the browser's own warning.
  assert.match(guard, /window\.addEventListener\('beforeunload', onBeforeUnload\)/)
  assert.match(guard, /const onBeforeUnload = \(event: BeforeUnloadEvent\) => \{\n\s+if \(leaving\) return/)
  // Back and Forward: held where the browser allows it (same-page steps only), asked, then taken.
  assert.match(guard, /navigation\?\.addEventListener\('navigate', onNavigate\)/)
  assert.match(guard, /step\.navigationType !== 'traverse' \|\| !step\.cancelable \|\| !step\.destination\?\.sameDocument/)
  assert.match(guard, /void confirmLeave\(\)\.then\(ok => \{ if \(ok\) window\.history\.go\(delta\) \}\)/)
  // The admin's own dialog, with plain words and Stay as the safe choice.
  assert.match(guard, /title: 'Leave without saving\?'/)
  assert.match(guard, /confirmLabel: 'Leave without saving',\n\s+cancelLabel: 'Stay on this page',/)
  // Once the person chose to leave, nothing asks again.
  assert.match(guard, /if \(ok\) leaving = true/)
  // No curly quotes: the worker bundle stays Latin-1 (scripts/check-worker-charset.mjs).
  assert.ok([...guard].every(ch => ch.charCodeAt(0) <= 0xff))
})

test('admin links ask first, then go only if the person chooses to leave', () => {
  assert.match(link, /onNavigate=\{event => \{/)
  assert.match(link, /if \(held \|\| !hasUnsavedChanges\(\)\) return/)
  // A link within the same page (#section) doesn't ask.
  assert.match(link, /if \(target\.pathname === window\.location\.pathname && target\.search === window\.location\.search\) return/)
  assert.match(link, /void confirmLeave\(\)\.then\(ok => \{\n\s+if \(!ok\) return/)
  assert.match(link, /else router\.push\(href, \{ scroll: props\.scroll \?\? true \}\)/)
  // Still no background prefetch (tests/visitor-tracking.test.ts).
  assert.match(link, /prefetch = false/)
  // The loading bar started on the click; while the question is open nothing loads, so it stops.
  assert.match(link, /event\.preventDefault\(\)\n[^\n]*\n\s+window\.dispatchEvent\(new Event\('admin:navigation-held'\)\)/)
  assert.match(read('components/nav-progress.tsx'), /window\.addEventListener\('admin:navigation-held', stop\)/)
})

test('every editor that tracks unsaved changes uses the guard, and nothing else listens for unload', () => {
  for (const file of EDITORS) assert.match(read(file), /useLeaveGuard\(dirty\)/, file)
  for (const name of readdirSync('components').filter(n => /\.tsx?$/.test(n) && n !== 'use-leave-guard.ts')) {
    assert.doesNotMatch(read(`components/${name}`), /'beforeunload'/, name)
  }
  // Their own back arrows used their own question; the link now asks the shared one.
  assert.doesNotMatch(read('components/product-editor-v2.tsx'), /Discard unsaved changes\?/)
  assert.doesNotMatch(read('components/customer-detail-admin.tsx'), /Discard unsaved changes\?/)
  assert.match(read('components/customer-detail-admin.tsx'), /<Link href="\/admin\/customers" className=\{ui\.iconBtn\} aria-label="Back to customers">/)
})

test('editors that leave on purpose say so first, so the warning does not ask', () => {
  const product = read('components/product-editor-v2.tsx')
  assert.match(product, /if \(creating\) \{ allowLeave\(\); window\.location\.href = `\/admin\/products\/\$\{data\.product\.id\}` \}/)
  assert.match(product, /allowLeave\(\)\n\s+window\.location\.href = '\/admin\/products'/)
  assert.match(read('components/theme-studio.tsx'), /allowLeave\(\)\n\s+setDirty\(false\)\n\s+window\.location\.reload\(\)/)
  assert.doesNotMatch(read('components/theme-studio.tsx'), /leavingRef/)
  assert.match(read('components/settings-center-pro.tsx'), /allowLeave\(\)\n\s+window\.location\.reload\(\)/)
})
