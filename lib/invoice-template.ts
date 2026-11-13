// The invoice's shape and wording, shared by the server (lib/invoice.ts) and the page
// (components/order-invoice.tsx). No server imports here.
import { customerName, customerPhone, addressLines, paymentInfo, statusInfo } from '@/lib/order-flow'
import { markT, statusLabel, type T } from '@/lib/i18n'

// The title and thank-you line are the store's own texts; left as these defaults, the customer's copy shows them in
// the customer's language (components/order-invoice.tsx).
export const INVOICE_DEFAULTS = {
  title: markT('Invoice'),
  notes: '',
  footer: markT('Thank you for shopping with us!'),
}

export type InvoiceStore = { name: string; logoUrl: string; color: string; address: string; phone: string; email: string; website: string; title: string; notes: string; footer: string }
export type InvoiceItem = { id: string; name: string; variant: string; quantity: number; unitPrice: number; totalPrice: number }
export type InvoiceOrder = {
  id: string; orderNumber: string; createdAt: string; status: string; paymentMethod: string; paymentStatus: string; currency: string
  email: string; phone: string; userName: string; shippingAddressJson: string; shippingMethod: string
  subtotal: number; discountTotal: number; shippingTotal: number; taxTotal: number; grandTotal: number
  items: InvoiceItem[]
}

// What the customer owes, in words: "Paid", "Pay on delivery", "Amount due".
export function invoiceBalance(order: Pick<InvoiceOrder, 'paymentMethod' | 'paymentStatus' | 'status'>) {
  if (order.paymentStatus === 'PAID') return { label: markT('Paid'), due: false }
  if (order.paymentStatus === 'REFUNDED') return { label: markT('Refunded'), due: false }
  if (order.paymentStatus === 'PARTIALLY_REFUNDED') return { label: markT('Paid (partly refunded)'), due: false }
  if (order.status === 'CANCELLED') return { label: markT('Cancelled'), due: false }
  if (order.paymentMethod === 'COD') return { label: markT('Pay on delivery'), due: true }
  return { label: markT('Amount due'), due: true }
}

// The admin's payment line (lib/order-flow.ts paymentInfo), in the customer's language: in English the two read the same.
const PAYMENT_LINES: Record<string, string> = {
  PAID: markT('{method} · paid'), REFUNDED: markT('{method} · refunded'), PARTIALLY_REFUNDED: markT('{method} · partly refunded'), FAILED: markT('{method} · payment failed'),
}
export function customerPaymentLine(order: Pick<InvoiceOrder, 'paymentMethod' | 'paymentStatus' | 'status'>, t: T) {
  const method = statusLabel(t, order.paymentMethod)
  if (PAYMENT_LINES[order.paymentStatus]) return t(PAYMENT_LINES[order.paymentStatus], { method })
  if (order.status === 'CANCELLED') return t('{method} · not paid', { method })
  if (order.paymentMethod === 'COD') return t('Cash on delivery · not collected yet')
  return t('{method} · waiting for payment', { method })
}

// With t, the customer's copy (/invoice/<id>): their language, and the order's state in the words of their own order
// pages ("Pending", where the admin says "New"). Without it, the admin's copy, in English.
export function invoiceView(order: InvoiceOrder, t?: T) {
  const flow = { ...order, user: order.userName ? { name: order.userName } : null }
  const balance = invoiceBalance(order)
  return {
    customer: customerName(flow),
    phone: customerPhone(flow),
    email: order.email,
    address: addressLines(flow),
    status: t ? statusLabel(t, order.status) : statusInfo(order.status).label,
    payment: t ? customerPaymentLine(order, t) : paymentInfo(flow).label,
    balance: t ? { ...balance, label: t(balance.label) } : balance,
  }
}
