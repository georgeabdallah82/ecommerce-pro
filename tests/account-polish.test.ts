import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AR } from '../lib/i18n-ar'
import { ORDER_STATUS_LABELS, countOf } from '../lib/i18n'

// Account polish (docs/account-polish-2026-11.md): the dashboard's tiles, the order history, the order statuses,
// the order page's totals and the empty wishlist.

const read = (path: string) => readFileSync(path, 'utf8')
const css = () => read('app/storefront-account.css')

// WCAG relative luminance and contrast, for the status colours.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }

test('the order history shows what was bought, the item count and the status in the shopper\'s language', () => {
  const page = read('app/account/orders/page.tsx')
  assert.match(page, /include: \{ items: \{ select: \{ quantity: true, product: \{ select: \{ images: \{ orderBy: \{ sortOrder: 'asc' \}, take: 1, select: \{ url: true \} \} \} \} \} \} \}/)
  assert.match(page, /<OrderThumbs photos=\{o\.items\.slice\(0, 3\)\.map\(item => realPhoto\(item\.product\?\.images\?\.\[0\]\?\.url\)\)\} \/>/)
  assert.match(page, /countOf\(lang, o\.items\.reduce\(\(n, item\) => n \+ item\.quantity, 0\), 'item'\)/)
  // It printed the raw value ("CONFIRMED"), in Arabic too.
  assert.match(page, /<span className="pill" data-status=\{o\.status\}>\{statusLabel\(t, o\.status\)\}<\/span>/)
  assert.doesNotMatch(page, /<span className="pill">\{o\.status\}<\/span>/)
  assert.equal(countOf('en', 2, 'item'), '2 items')
  assert.equal(countOf('ar', 2, 'item'), 'قطعتان')
})

test('order photos: up to three, a parcel tile when a product has none, never the stock placeholder', () => {
  const thumbs = read('components/order-thumbs.tsx')
  assert.match(thumbs, /photos\.slice\(0, 3\)\.map\(\(src, i\) => src\n\s+\? <StoreImage key=\{i\} src=\{src\} alt="" \/>\n\s+: <span key=\{i\} className="orderThumbBlank"><Package/)
  assert.match(thumbs, /<span className="orderThumbs" aria-hidden="true">/, 'decorative: the number, date and total are written beside them')
  // StoreImage renders the <img> itself, so the 46 px size is set on the child, and nothing larger overrides it.
  assert.match(css(), /html body\.mk \.orderThumbs > \* \{ flex: none; width: 46px; height: 46px;/)
  assert.doesNotMatch(css(), /\.orderThumbs img \{[^}]*width: 100%/, 'a full-width image rule made the photos 800 px wide')
})

test('every order status has a label in both languages and its own colour, readable at 4.5:1', () => {
  const styles = css()
  for (const status of ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']) {
    assert.ok(AR[ORDER_STATUS_LABELS[status]], status)
    const rule = styles.split('\n').find(line => line.startsWith('html body.mk .pill') && line.includes(`[data-status="${status}"]`))
    assert.ok(rule, `${status} has a colour`)
    const [, bg, fg] = rule!.match(/background: (#[0-9a-f]{6}); color: (#[0-9a-f]{6});/)!
    assert.ok(contrast(bg, fg) >= 4.5, `${status}: ${contrast(bg, fg).toFixed(2)}:1`)
  }
  assert.match(styles, /html body\.mk \.pill\[data-status\] \{ border-color: color-mix\(in srgb, currentColor 22%, transparent\); \}/)
  // The dashboard's recent orders and the order page colour their status the same way.
  assert.match(read('app/account/page.tsx'), /<span className="pill" data-status=\{o\.status\}>\{statusLabel\(t,o\.status\)\}<\/span>/)
  assert.match(read('app/account/orders/[orderNumber]/page.tsx'), /<span className="pill" data-status=\{order\.status\}>\{statusLabel\(tr,order\.status\)\}<\/span>/)
})

test('the dashboard tiles have icons, and the ones with a page are links', () => {
  const page = read('app/account/page.tsx')
  assert.match(page, /import \{ Bell, Coins, MapPin, Package, Wallet \} from 'lucide-react'/)
  assert.match(page, /<Link href="\/account\/orders" className="card stat"><span className="statIcon" aria-hidden="true"><Package size=\{18\}\/><\/span>/)
  assert.match(page, /<div className="card stat"><span className="statIcon" aria-hidden="true"><MapPin size=\{18\}\/><\/span><span className="muted">\{t\('Saved addresses'\)\}/, 'no page of its own: the addresses are further down')
  assert.equal((page.match(/<Link href="\/account\/wallet" className="card stat">/g) || []).length, 2, 'the wallet and the coins')
  assert.match(page, /<Link href="\/account\/notifications" className="card stat"><span className="statIcon" aria-hidden="true"><Bell size=\{18\}\/><\/span>/)
  assert.equal((page.match(/className="statIcon"/g) || []).length, 5)
})

test('the tiles sit two to a row on phones, three and two on tablets, five on computers', () => {
  const styles = css()
  // storefront-legacy.css forces one column below 900 px with !important and (0,3,2) specificity; these outrank it.
  assert.match(read('app/storefront-legacy.css'), /body:not\(:has\(\.adminShell\)\) main\.section \.accountStats \{\n\s+grid-template-columns: 1fr !important;/)
  assert.match(styles, /html body\.mk main \.grid\.accountStats \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important; grid-auto-rows: 1fr;/)
  assert.match(styles, /@media \(max-width: 359px\) \{ html body\.mk main \.grid\.accountStats \{ grid-template-columns: minmax\(0, 1fr\) !important; \} \}/)
  assert.match(styles, /@media \(min-width: 640px\) and \(max-width: 1023px\) \{\n  html body\.mk main \.grid\.accountStats \{ grid-template-columns: repeat\(6, minmax\(0, 1fr\)\) !important;/)
  assert.match(styles, /@media \(min-width: 1024px\) \{ html body\.mk main \.grid\.accountStats \{ grid-template-columns: repeat\(5, minmax\(0, 1fr\)\) !important;/)
  // The hover shadow outranks the flat one storefront-legacy.css gives every .card with !important.
  assert.match(styles, /html body\.mk a\.stat:hover \{ box-shadow: [^}]*!important; transform: translateY\(-2px\); \}/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{\n  html body\.mk :is\(a\.stat, \.orderRow\) \{ transition: none; \}\n  html body\.mk a\.stat:hover \{ transform: none; \}/)
})

test('the order page lists the discount and tax, so its lines add up to the total', () => {
  const page = read('app/account/orders/[orderNumber]/page.tsx')
  assert.match(page, /shippingTotal:true,subtotal:true,discountTotal:true,taxTotal:true,grandTotal:true/)
  assert.match(page, /\{order\.discountTotal>0&&<div className="summaryLine isSaving"><span>\{tr\('Discount'\)\}<\/span><strong dir="ltr">−\{money\(order\.discountTotal,order\.currency\)\}<\/strong><\/div>\}/)
  assert.match(page, /\{order\.taxTotal>0&&<div className="summaryLine"><span>\{tr\('Tax'\)\}<\/span><strong>\{money\(order\.taxTotal,order\.currency\)\}<\/strong><\/div>\}/)
  assert.ok(AR['Discount'] && AR['Tax'])
  // The amount stays one left-to-right unit in Arabic ("−$160.00", not "$160.00−"), here and on the confirmation.
  assert.match(read('app/order/success/page.tsx'), /<strong dir="ltr">−\{money\(record\.discountTotal, record\.currency\)\}<\/strong>/)
  assert.ok(contrast('#15803d', '#ffffff') >= 4.5, 'the saving green on the card')
})

test('an empty wishlist says how to save something, with the way to the shop', () => {
  const grid = read('components/wishlist-grid.tsx')
  assert.match(grid, /<section className="wishEmpty" role="status">\n\s+<span className="wishEmptyIcon" aria-hidden="true"><Heart size=\{26\} \/><\/span>/)
  assert.match(grid, /<p>\{t\('Tap the heart on any product to keep it here for later\.'\)\}<\/p>\n\s+<Link className="focalButton primary" href="\/shop">\{t\('Browse the shop'\)\}<\/Link>/)
  assert.ok(AR['Tap the heart on any product to keep it here for later.'])
  // "SAVED" above the title was grey on a peach pill, 4.0:1 at 11 px: now plain small text in the muted ink.
  assert.match(grid, /<main className="focalStorefront aliShopPage wishlistPage">/)
  assert.match(css(), /html body\.mk \.wishlistPage > \.aliContainer > \.focalEyebrow \{ font-size: 13px !important;[^}]*color: var\(--mk-muted, #5b616b\) !important; background: none !important;/)
  assert.ok(contrast('#5b616b', '#f6f6f4') >= 4.5)
})

test('the account pages\' card titles are h2 under the page\'s h1, all one size', () => {
  const titles: [string, number][] = [['app/account/page.tsx', 3], ['app/account/orders/[orderNumber]/page.tsx', 5], ['app/account/wallet/page.tsx', 2], ['app/account/orders/page.tsx', 1], ['app/account/notifications/page.tsx', 1], ['components/buy-again.tsx', 1], ['components/address-book.tsx', 1], ['components/change-password.tsx', 1], ['components/delete-account.tsx', 1]]
  for (const [file, count] of titles) {
    const src = read(file)
    assert.doesNotMatch(src, /<h3[ >]/, `${file}: an h3 straight after the h1 skips a level`)
    assert.equal((src.match(/<h2 className="(?:h3 )?accountTitle"/g) || []).length, count, file)
  }
  // "Your data" had no padding, its text against the card's edge, and stretched to the card beside it.
  assert.match(read('app/account/page.tsx'), /<div className="card" style=\{\{padding:24,marginTop:24,alignSelf:'start'\}\}><h2 className="accountTitle" style=\{\{marginTop:0\}\}>\{t\('Your data'\)\}<\/h2>/)
  const styles = css()
  assert.match(styles, /html body\.mk h2\.accountTitle \{ font-size: 1\.17em; margin-block: 1em; \}/, 'the size the h3s had')
  // The way back is a 44 px target, and the order timeline's times are no longer 11.7 px.
  assert.match(styles, /html body\.mk main\.section :is\(\.container > a\.textLink:first-child, \.sectionHead > div > a\.textLink:first-child\) \{ display: inline-flex; align-items: center; min-height: 44px; \}/)
  assert.match(styles, /html body\.mk \.timelineItem small \{ font-size: 12\.5px; \}/)
})

test('the account styles load last', () => {
  const layout = read('app/layout.tsx')
  assert.ok(layout.indexOf("import './storefront-account.css'") > layout.indexOf("import './storefront-polish.css'"))
  assert.ok(layout.indexOf("import './storefront-polish.css'") > 0)
})
