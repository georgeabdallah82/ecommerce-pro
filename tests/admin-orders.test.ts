import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { REGION_CODES, countryCode, countryName } from '@/lib/delivery-countries'

// Admin > Orders: the order list, the order page and what they share (docs/admin-orders-2026-11.md).

const read = (path: string) => readFileSync(path, 'utf8')
const list = read('components/orders-admin-shopify.tsx')
const detail = read('components/order-detail-admin.tsx')
const menu = read('components/admin-menu.tsx')

test('country names are the same on the server and in the browser', () => {
  // Node's own names for these differ from Chrome's ("Hong Kong SAR China" against "Hong Kong"): the country list
  // rendered on the server didn't match the browser's, and React threw away the page (New order, Settings, checkout).
  assert.equal(countryName('HK'), 'Hong Kong')
  assert.equal(countryName('MO'), 'Macao')
  assert.equal(countryName('PS'), 'Palestine')
  assert.equal(countryName('FK'), 'Falkland Islands')
  assert.equal(countryName('CI'), 'Côte d’Ivoire')
  assert.equal(countryName('LB'), 'Lebanon')
  for (const code of REGION_CODES) assert.notEqual(countryName(code), code, code)
  // Names the engine gives, as older addresses were saved, still read back.
  assert.equal(countryCode('Hong Kong SAR China'), 'HK')
  assert.equal(countryCode('Palestinian Territories'), 'PS')
  assert.equal(countryCode('Palestine'), 'PS')
  assert.equal(countryCode('lebanon'), 'LB')
  // The currency list is fixed too (Node had SLE, XCG and ZWG; Chrome didn't): Settings threw away its page.
  const selects = read('components/field-selects.tsx')
  assert.doesNotMatch(selects, /supportedValuesOf\?\.\('currency'\)/)
  assert.match(selects, /const CURRENCY_CODES: string\[\] = \[\n  'AED', /)
  for (const code of ['USD', 'EUR', 'LBP', 'SLE', 'ZWG']) assert.ok(selects.includes(`'${code}'`), code)
  // Arabic names still come from the engine.
  assert.ok(countryName('LB', 'ar').length > 0)
  // The file stays Latin-1 (scripts/check-worker-charset.mjs): the one curly apostrophe is written as an escape.
  assert.ok([...read('lib/delivery-countries.ts')].every(ch => ch.charCodeAt(0) <= 0xff))
})

test('the More menus work from the keyboard', () => {
  assert.match(menu, /aria-haspopup="menu" aria-expanded=\{open\} aria-label=\{label\}/)
  assert.match(menu, /items\(\)\[0\]\?\.focus\(\)/)
  assert.match(menu, /if \(event\.key === 'Escape'\) \{ event\.preventDefault\(\); event\.stopPropagation\(\); setOpen\(false\); button\.current\?\.focus\(\) \}/)
  assert.match(menu, /onClick=\{\(\) => \{ button\.current\?\.focus\(\); setOpen\(false\) \}\}/)
  for (const key of ["'ArrowDown') go(at + 1)", "'Home') go(0)", "'End') go(list.length - 1)", "'Tab') setOpen(false)"]) assert.ok(menu.includes(key), key)
  assert.match(list, /function MoreMenu[\s\S]*?return <AdminMenu /)
  assert.match(detail, /function Menu[\s\S]*?return <AdminMenu [^>]*label="More actions for this order"/)
  // Every item is a menu item; the count sits beside the button, which says what it counts.
  assert.match(list, /<Link role="menuitem" href="\/admin\/orders\/deliveries">/)
  assert.match(list, /<Link role="menuitem" href="\/admin\/orders\/unfinished">/)
  assert.match(list, /label=\{`More order pages\$\{unfinishedCount \? `, \$\{unfinishedCount\} unfinished checkout/)
  assert.match(list, /badge=\{badge \? <span className=\{`\$\{styles\.menuBadge\} \$\{styles\.menuBadgeCorner\}`\} aria-hidden="true">/)
})

test('the refund and tracking dialog is a dialog, and keeps its errors and its typing', () => {
  assert.match(list, /useModalFocus\(modalRef, !!modal, \(\) => \{ if \(!busy\) closeModal\(\) \}\)/)
  assert.match(list, /role="dialog" aria-modal="true" aria-labelledby=\{modalTitle\} tabIndex=\{-1\}/)
  assert.equal((list.match(/\{modalError && <div className=\{`\$\{ui\.alert\} \$\{ui\.alertDanger\}`\} role="alert">\{modalError\}<\/div>\}/g) || []).length, 2)
  assert.match(list, /setModalError\(`Refund must be between 0\.01 and/)
  // Tracking: the dialog closes only once the save worked.
  const save = list.slice(list.indexOf('async function saveTracking'), list.indexOf('const toConfirm'))
  assert.match(save, /await api\('\/api\/admin\/orders'[\s\S]*?closeModal\(\); setNotice\('Tracking number saved\.'\)[\s\S]*?catch \(e\) \{\s*setModalError/)
  // Refund is offered only when something paid is left to give back.
  assert.match(list, /Number\(o\.grandTotal \|\| 0\) - Number\(o\.refundedTotal \|\| o\.refundedAmount \|\| 0\) > 0 && <button role="menuitem"/)
  assert.match(list, /<h2 className=\{styles\.emptyTitle\}>No orders here<\/h2>/)
  // A dialog opened on top (the password check before a refund) keeps its own keys.
  assert.match(read('components/use-modal-focus.ts'), /if \(inside && inside !== dialog && !dialog\.contains\(inside\)\) return/)
})

test('the order page: one main landmark, labelled notes, panels that stay open on a failed save', () => {
  assert.doesNotMatch(detail, /<main |<\/main>/)
  assert.match(detail, /aria-label="Note for the team"/)
  assert.match(detail, /aria-label="Staff note"/)
  assert.match(detail, /router\.refresh\(\)\n\s+return true\n\s+\} catch \(e\) \{ say\(e instanceof Error \? e\.message : 'Unable to update order', true\); return false \}/)
  assert.match(detail, /if \(await patch\(\{ trackingNumber: tracking,[^\n]*\)\) setTrackingOpen\(false\)/)
  assert.match(detail, /'Saved\.'\)\) setManual\(false\)/)
  // The edit form's Save and Cancel are at its end too.
  assert.match(detail, /\{editing && <div className=\{`\$\{s\.actions\} \$\{s\.editEnd\}`\}>/)
  // Times in the store's time zone, the same on the server and in the browser.
  assert.doesNotMatch(detail, /toLocaleString\(\)/)
  assert.match(detail, /<span>\{formatAdminDateTime\(p\.createdAt, storeTimezone\)\}<\/span>/)
  assert.match(read('components/delivery-tracking-admin.tsx'), /Live tracking can start once the order is Preparing or Out for delivery\./)
})

test('an order\'s browser tab names the order', () => {
  assert.match(detail, /data-admin-title=\{`Order #\$\{o\.orderNumber\}`\}/)
  assert.match(read('components/invoice-workspace.tsx'), /data-admin-title=\{mode === 'customer' \? undefined : `Invoice #\$\{order\.orderNumber\}`\}/)
  const nav = read('components/admin-nav.tsx')
  assert.match(nav, /document\.querySelector<HTMLElement>\('\[data-admin-title\]'\)\?\.dataset\.adminTitle \|\| current\.label/)
  assert.match(nav, /content\.observe\(document\.body, \{ childList: true, subtree: true \}\)/)
})

test('WhatsApp buttons and info labels are readable', () => {
  // White on WhatsApp's #25d366 is 2:1. It may still draw a border, never a button with text on it.
  for (const file of readdirSync('components').filter(name => name.endsWith('.module.css'))) {
    assert.doesNotMatch(read(`components/${file}`), /background: #25d366/, file)
  }
  assert.match(read('components/admin-orders-board.module.css'), /\.whatsapp \{ border-color: #15803d; background: #15803d; color: #fff; \}/)
  assert.match(read('components/admin-orders-board.module.css'), /\.toneInfo \{ background: color-mix\(in srgb, #2563eb 13%, transparent\); color: #1d4ed8; \}\n:global\(html\[data-admin-theme='dark'\]\) \.toneInfo \{ color: #93b4f5; \}/)
  assert.match(read('components/order-detail-admin.module.css'), /\.toneInfo \{ color: var\(--admin-accent-strong\); background: var\(--admin-accent-soft\); \}/)
})
