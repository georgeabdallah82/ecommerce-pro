// The invoice's shape and wording, shared by the server (lib/invoice.ts) and the page
// (components/order-invoice.tsx). No server imports here.
import { customerName, customerPhone, addressLines, paymentInfo, statusInfo } from '@/lib/order-flow'

export const INVOICE_DEFAULTS = {
  title: 'Invoice',
  notes: '',
  footer: 'Thank you for shopping with us!',
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
  if (order.paymentStatus === 'PAID') return { label: 'Paid', due: false }
  if (order.paymentStatus === 'REFUNDED') return { label: 'Refunded', due: false }
  if (order.paymentStatus === 'PARTIALLY_REFUNDED') return { label: 'Paid (partly refunded)', due: false }
  if (order.status === 'CANCELLED') return { label: 'Cancelled', due: false }
  if (order.paymentMethod === 'COD') return { label: 'Pay on delivery', due: true }
  return { label: 'Amount due', due: true }
}

export function invoiceView(order: InvoiceOrder) {
  const flow = { ...order, user: order.userName ? { name: order.userName } : null }
  return {
    customer: customerName(flow),
    phone: customerPhone(flow),
    email: order.email,
    address: addressLines(flow),
    status: statusInfo(order.status).label,
    payment: paymentInfo(flow).label,
    balance: invoiceBalance(order),
  }
}
