import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// The admin menu keeps rarely used pages behind a "More" toggle (components/admin-nav.tsx) and shows
// the three health pages as one "Health" entry. Nothing may become unreachable by that.
const layout = readFileSync('app/admin/layout.tsx', 'utf8')
const hrefs = [...layout.matchAll(/href: '(\/admin[^']*)'/g)].map(m => m[1])
const pageFor = (href: string) => `app${href}/page.tsx`

describe('admin menu', () => {
  it('lists every address once and each one is a real page', () => {
    assert.equal(new Set(hrefs).size, hrefs.length)
    for (const href of hrefs) assert.ok(existsSync(pageFor(href)) || href === '/admin' && existsSync('app/admin/page.tsx'), `${href} has no page`)
  })
  it('tucks only rarely used pages behind More, never the everyday ones', () => {
    const tucked = [...layout.matchAll(/href: '(\/admin[^']*)', label: '([^']*)'[^\n]*more: true/g)].map(m => m[2])
    // Pages, Blog and URL redirects were in no menu at all (docs/admin-online-store-pages-2026-11.md); they are
    // listed behind Online Store's More.
    assert.deepEqual(tucked.sort(), ['Barcode stickers', 'Blog', 'Draft orders', 'Occasions', 'Invite a friend', 'Operations', 'Order edits', 'Pages', 'Purchase orders', 'Rewards', 'Stock count', 'Suppliers', 'Transfers', 'URL redirects'].sort())
    for (const everyday of ['Orders', 'Products', 'Collections', 'Inventory', 'Customers', 'Discounts', 'Health']) assert.ok(!tucked.includes(everyday))
  })
  it('keeps the launch checklist and website status inside the Health entry', () => {
    assert.match(layout, /label: 'Health'.*alsoActive: \['\/admin\/launch', '\/admin\/website-status'\]/)
    for (const page of ['system', 'launch', 'website-status']) assert.ok(existsSync(`app/admin/${page}/page.tsx`))
  })
  it('names the browser tab after the page, on every <title>, after clicks between pages too', () => {
    // After a click Next adds a second <title> (the store name) in front of the old one; the browser
    // shows the first, so the tab title must be applied to all of them and re-applied on head changes.
    const nav = readFileSync('components/admin-nav.tsx', 'utf8')
    assert.match(nav, /querySelectorAll\('title'\)/)
    assert.match(nav, /observer\.observe\(document\.head,/)
  })
})
