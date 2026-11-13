import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AR } from '../lib/i18n-ar'
import { translator } from '../lib/i18n'
import { paymentInfo } from '../lib/order-flow'
import { customerPaymentLine, invoiceView, type InvoiceOrder } from '../lib/invoice-template'

// Store links (docs/store-links-2026-11.md): the collection pages, and the pages a customer reaches from a link the
// store sends: the invoice, paying an invoice, email preferences and an expired courier link.

const read = (path: string) => readFileSync(path, 'utf8')
const order: InvoiceOrder = {
  id: 'o1', orderNumber: '1001', createdAt: '2026-11-12T10:00:00Z', status: 'PENDING', paymentMethod: 'COD', paymentStatus: 'UNPAID', currency: 'USD',
  email: 'maya@example.com', phone: '70123456', userName: 'Maya Haddad', shippingAddressJson: '{}', shippingMethod: 'Standard delivery',
  subtotal: 19800, discountTotal: 16000, shippingTotal: 0, taxTotal: 0, grandTotal: 3800, items: [],
}

test('the collection page: a named sort menu, the count once, and a heading level between the title and the products', () => {
  const page = read('components/aliexpress-collection-detail.tsx')
  assert.match(page, /<select value=\{sort\} onChange=\{e => setSort\(e\.target\.value\)\} aria-label=\{t\('Sort products'\)\}>/)
  // "5 products" was under the title and again above the grid; the toolbar keeps it.
  assert.doesNotMatch(page, /aliCollectionCount/)
  assert.match(page, /<span className="focalResultCount">\{plural\(products\.length, 'product'\)\}<\/span>/)
  assert.match(page, /<h2 className="srOnly">\{t\('Products'\)\}<\/h2>/)
  for (const text of ['Sort products', 'Products']) assert.ok(AR[text], text)
  // The small label above the title: 13 px in the darker grey (it was 11 px at 4.0:1), light over a photo.
  const css = read('app/storefront-links.css')
  assert.match(css, /html body\.mk :is\(\.aliCollectionsHead, \.aliCollectionBannerOverlay\) \.focalEyebrow \{[^}]*color: var\(--mk-muted, #5b616b\) !important; font-size: 13px !important;[^}]*letter-spacing: 0 !important; \}/)
  assert.match(css, /html body\.mk \.aliCollectionBannerOverlay \.focalEyebrow \{ color: rgba\(255, 255, 255, \.9\) !important; \}/)
})

test('the customer\'s invoice speaks their language; the admin\'s copy reads as before', () => {
  // The admin's copy: English, the admin's words for the state.
  const admin = invoiceView(order)
  assert.equal(admin.status, 'New')
  assert.equal(admin.payment, 'Cash on delivery · not collected yet')
  assert.deepEqual(admin.balance, { label: 'Pay on delivery', due: true })
  // The customer's copy in English: the words of their own order pages.
  const en = invoiceView(order, translator('en'))
  assert.equal(en.status, 'Pending')
  assert.equal(en.payment, admin.payment)
  // In Arabic.
  const ar = invoiceView(order, translator('ar'))
  assert.equal(ar.status, AR.Pending)
  assert.equal(ar.payment, AR['Cash on delivery · not collected yet'])
  assert.equal(ar.balance.label, AR['Pay on delivery'])
  // The payment line says the same as the admin's in every state.
  const states: Array<Partial<InvoiceOrder>> = [
    { paymentStatus: 'PAID', paymentMethod: 'CARD' }, { paymentStatus: 'REFUNDED', paymentMethod: 'BANK_TRANSFER' }, { paymentStatus: 'PARTIALLY_REFUNDED', paymentMethod: 'CARD' },
    { paymentStatus: 'FAILED', paymentMethod: 'CARD' }, { paymentStatus: 'UNPAID', status: 'CANCELLED', paymentMethod: 'WALLET' }, { paymentStatus: 'UNPAID', paymentMethod: 'COD' },
    { paymentStatus: 'UNPAID', paymentMethod: 'BANK_TRANSFER' },
  ]
  for (const change of states) {
    const one = { ...order, ...change }
    assert.equal(customerPaymentLine(one, translator('en')), paymentInfo(one).label, JSON.stringify(change))
    assert.notEqual(customerPaymentLine(one, translator('ar')), paymentInfo(one).label, JSON.stringify(change))
  }
})

test('the invoice paper lays out right to left in Arabic, with amounts left to right and readable labels', () => {
  const paper = read('components/order-invoice.tsx')
  assert.match(paper, /<article className=\{s\.sheet\} dir=\{lang === 'ar' \? 'rtl' : 'ltr'\} lang=\{lang\}/)
  assert.match(paper, /const tr = t \|\| english/)
  for (const label of ['Order', 'Date', 'Status', 'Bill to', 'Deliver to', 'Item', 'Qty', 'Price', 'Total', 'Payment', 'Subtotal', 'Discount', 'Delivery', 'Free', 'Tax']) {
    assert.match(paper, new RegExp(`tr\\('${label}'\\)`), label)
    assert.ok(AR[label], label)
  }
  assert.match(paper, /const m = \(cents: number\) => <span dir="ltr">\{money\(cents, order\.currency\)\}<\/span>/)
  // The store's own texts: as typed, or translated while they are still the defaults.
  assert.match(paper, /<h1 className=\{s\.docTitle\}>\{tr\(store\.title\)\}<\/h1>/)
  for (const text of ['Invoice', 'Thank you for shopping with us!']) assert.ok(AR[text], text)
  const css = read('components/order-invoice.module.css')
  assert.doesNotMatch(css, /text-align: (left|right)|padding-(left|right)/, 'start and end, so Arabic mirrors')
  assert.match(css, /\.sheet h2 \{ margin: 0 0 6px; font-size: 12px;/)
  assert.match(css, /\.sheet h2, \.items th \{ font-size: 10\.5px; \}/, 'the paper keeps its size')
  // The storefront makes tables scroll boxes below 900 px; the invoice keeps its table, full width, on a phone and on paper.
  assert.match(css, /\.sheet \.items \{ display: table !important; \}/)
  assert.match(css, /\.sheet:lang\(ar\) h2, \.sheet:lang\(ar\) \.items th, \.sheet:lang\(ar\) \.docTitle, \.sheet:lang\(ar\) \.brandName \{ letter-spacing: 0; \}/)
  // What is still to pay: dark text (the store's red was 4.3:1 on its tint).
  assert.match(css, /\.due \{ background: color-mix\(in srgb, var\(--inv-brand, #18181b\) 10%, #fff\); color: var\(--inv-ink\); border-inline-start: 4px solid var\(--inv-brand, var\(--inv-ink\)\); \}/)
  // The page around it: the button and the hint translated, and only the customer's copy follows their language.
  const page = read('components/invoice-workspace.tsx')
  assert.match(page, /t=\{customer \? t : undefined\} lang=\{customer \? lang : 'en'\}/)
  assert.match(page, /\{t\('Print \/ Save PDF'\)\}/)
  assert.match(page, /\{customer && <p className=\{s\.hint\}>\{t\('To keep a copy, tap “Print \/ Save PDF” and choose “Save as PDF”\.'\)\}<\/p>\}/)
  assert.match(read('components/invoice-workspace.module.css'), /\.customerPage \.hint \{ color: var\(--mk-muted, #5b616b\); \}/)
})

test('paying an invoice: the order pages\' cards, and "already paid" only when the order is', () => {
  const page = read('app/pay-invoice/[id]/page.tsx')
  assert.match(page, /import s from '@\/app\/order\/success\/success\.module\.css'/)
  assert.match(page, /const paid = Boolean\(completedOrder && PAID_STATUSES\.includes\(completedOrder\.paymentStatus\)\)/)
  assert.match(page, /t\('This invoice cannot be paid online right now\. Please contact us\.'\)/)
  assert.match(page, /<strong dir="ltr">\{m\(item\.totalPrice\)\}<\/strong>/)
  assert.match(page, /<span dir="auto">\{item\.quantity\} × \{item\.name\}<\/span>/)
  assert.match(page, /<InvoicePayClient draftOrderId=\{draft\.id\} token=\{token\} buttonClassName=\{`\$\{s\.btn\} \$\{s\.btnPrimary\}`\} \/>/)
  assert.ok(AR['This invoice cannot be paid online right now. Please contact us.'])
  // One list of paid states, for the page and the pay route.
  assert.match(read('lib/invoice-payment.ts'), /export const PAID_STATUSES = \['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'\]/)
  const route = read('app/api/invoice/[id]/pay/route.ts')
  assert.match(route, /import \{ PAID_STATUSES, startInvoicePayment \} from '@\/lib\/invoice-payment'/)
  assert.doesNotMatch(route, /const PAID_STATUSES/)
  const pay = read('components/invoice-pay-client.tsx')
  assert.match(pay, /<button type="button" className=\{buttonClassName\} onClick=\{pay\} disabled=\{loading\} aria-busy=\{loading\}>/)
  assert.doesNotMatch(pay, /marginTop/)
})

test('email preferences and an expired courier link: the store\'s message card, in the shopper\'s language', () => {
  const unsubscribe = read('app/unsubscribe/page.tsx')
  assert.match(unsubscribe, /import s from '@\/app\/order\/success\/success\.module\.css'/)
  assert.doesNotMatch(unsubscribe, /card empty/)
  for (const icon of ['MailCheck', 'MailX', 'Link2Off']) assert.match(unsubscribe, new RegExp(`<${icon} size=\\{32\\} />`), icon)
  // It still asks first: mail scanners open every link in an email.
  assert.match(unsubscribe, /<form method="post" action=\{`\/api\/unsubscribe\?c=\$\{encodeURIComponent\(checkoutId\)\}&t=\$\{encodeURIComponent\(token\)\}`\}>/)
  const driver = read('app/driver/[token]/page.tsx')
  assert.match(driver, /<h1 className=\{s\.title\}>\{t\('This link no longer works'\)\}<\/h1>/)
  assert.match(driver, /<p className=\{s\.lead\}>\{t\('Ask the store to send you your new delivery link\.'\)\}<\/p>/)
  assert.doesNotMatch(driver, /fontFamily: 'system-ui/)
  for (const text of ['This link no longer works', 'Ask the store to send you your new delivery link.']) assert.ok(AR[text], text)
  const css = read('app/storefront-links.css')
  assert.match(css, /html body \.linkActions \{ display: grid; width: 100%; \}/)
  assert.match(css, /html body \.linkSubmit \{ width: 100%; font-family: inherit; font-size: inherit; cursor: pointer; \}/)
  assert.match(css, /html body \.linkContact a \{ text-decoration: underline; text-underline-offset: 3px; \}/)
  assert.match(read('app/pay-invoice/[id]/page.tsx'), /<p className=\{`\$\{s\.small\} linkContact`\}>/)
})

test('the footer\'s help band is a landmark, so nothing on the page sits outside one', () => {
  // It shows above the footer once the store has a phone number (axe: region).
  assert.match(read('components/footer.tsx'), /<div className="focalFooterHelp" role="region" aria-label=\{t\('Need help with your order\?'\)\}>/)
})

test('with the store\'s phone number set: the footer WhatsApp link is 44 px to tap and the WhatsApp order button passes contrast', () => {
  const css = read('app/storefront-links.css')
  assert.match(css, /@media \(pointer: coarse\) \{ html body \.focalFooterWhatsapp \{ min-height: 44px; \} \}/)
  assert.match(css, /html body \.waOrderBtn \{ color: #15803d !important; \}/)
})

test('the link styles load last', () => {
  const layout = read('app/layout.tsx')
  assert.ok(layout.indexOf("import './storefront-links.css'") > layout.indexOf("import './storefront-content.css'"))
})
