import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { invoiceBalance, invoiceView, type InvoiceOrder } from '@/lib/invoice-template'

const order: InvoiceOrder = {
  id: 'c1', orderNumber: '1001', createdAt: '2026-10-16T10:00:00.000Z', status: 'CONFIRMED', paymentMethod: 'COD', paymentStatus: 'UNPAID', currency: 'USD',
  email: '', phone: '70 123 456', userName: '', shippingMethod: 'Standard delivery',
  shippingAddressJson: JSON.stringify({ firstName: 'Rana', lastName: 'Haddad', line1: 'Hamra street, bldg 4', city: 'Beirut', country: 'Lebanon' }),
  subtotal: 2000, discountTotal: 0, shippingTotal: 400, taxTotal: 0, grandTotal: 2400,
  items: [{ id: 'i1', name: 'Tissue box', variant: '', quantity: 2, unitPrice: 1000, totalPrice: 2000 }],
}

describe('invoice', () => {
  it('reads in plain words, for a WhatsApp customer with no email', () => {
    const v = invoiceView(order)
    assert.equal(v.customer, 'Rana Haddad')
    assert.equal(v.phone, '70 123 456')
    assert.equal(v.email, '')
    assert.equal(v.status, 'Confirmed')
    assert.equal(v.payment, 'Cash on delivery · not collected yet')
    assert.deepEqual(v.address, ['Hamra street, bldg 4', 'Beirut', 'Lebanon'])
  })

  it('says what the customer still owes', () => {
    assert.deepEqual(invoiceBalance(order), { label: 'Pay on delivery', due: true })
    assert.deepEqual(invoiceBalance({ ...order, paymentMethod: 'BANK_TRANSFER' }), { label: 'Amount due', due: true })
    assert.deepEqual(invoiceBalance({ ...order, paymentStatus: 'PAID' }), { label: 'Paid', due: false })
    assert.deepEqual(invoiceBalance({ ...order, status: 'CANCELLED' }), { label: 'Cancelled', due: false })
  })

  it('opens inside the admin, not on the website', () => {
    const page = readFileSync('app/admin/orders/[id]/invoice/page.tsx', 'utf8')
    assert.doesNotMatch(page, /redirect\(/)
    assert.match(page, /<InvoiceWorkspace mode="admin"/)
  })

  it('prints the invoice alone, and customers need the link code or their account', () => {
    const css = readFileSync('components/invoice-workspace.module.css', 'utf8')
    assert.match(css, /@media print[\s\S]*:global\(body\):has\(> \.printHost\) > :not\(\.printHost\) \{ display: none !important; \}/)
    // The paper stays readable in the admin's dark mode (the admin forces its heading colour).
    const paper = readFileSync('components/order-invoice.module.css', 'utf8')
    assert.match(paper, /\.sheet\.sheet h2 \{ color: var\(--inv-muted\) !important; \}/)
    // The website shows tables as scroll boxes; the item list must stay a full-width table.
    assert.match(paper, /\.items \{ display: table; width: 100%;/)
    const customer = readFileSync('app/invoice/[id]/page.tsx', 'utf8')
    assert.match(customer, /canViewOrder\(order, \{ userId: viewer\?\.id, token: t \}\)/)
    assert.match(customer, /index: false/)
  })
})
