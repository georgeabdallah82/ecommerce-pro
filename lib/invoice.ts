import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { getContactInfo } from '@/lib/store-contact'
import { siteUrl } from '@/lib/seo'
import { orderViewToken } from '@/lib/order-access'
import { INVOICE_DEFAULTS, type InvoiceOrder, type InvoiceStore } from '@/lib/invoice-template'

// Everything an invoice shows (components/order-invoice.tsx), read on the server. The store part
// comes from the theme (name, logo), Settings (address, phone, email) and the invoice's own
// editable texts (Settings keys invoice.title / invoice.notes / invoice.footer, edited from the
// invoice page itself).

export const INVOICE_SETTING_KEYS = ['invoice.title', 'invoice.notes', 'invoice.footer'] as const

export async function getInvoiceStore(): Promise<InvoiceStore> {
  const [{ theme }, contact, rows] = await Promise.all([
    getThemeState(),
    getContactInfo(),
    db.setting.findMany({ where: { key: { in: [...INVOICE_SETTING_KEYS, 'store.name'] } }, select: { key: true, value: true } }),
  ])
  const map = new Map(rows.map(row => [row.key, row.value]))
  const site = siteUrl()
  return {
    name: String(theme?.brandName || map.get('store.name') || 'Our store').trim(),
    logoUrl: String(theme?.logoUrl || ''),
    // The store's main colour (theme editor) for the invoice's accents; plain dark if unset or odd.
    color: /^#[0-9a-f]{3,8}$/i.test(String(theme?.colors?.primary || '')) ? String(theme.colors.primary) : '#121212',
    address: contact.address || '',
    phone: contact.phone || '',
    email: contact.email || '',
    website: /localhost|127\.0\.0\.1/.test(site) ? '' : site.replace(/^https?:\/\//, ''),
    title: map.get('invoice.title')?.trim() || INVOICE_DEFAULTS.title,
    notes: map.get('invoice.notes') ?? INVOICE_DEFAULTS.notes,
    footer: map.get('invoice.footer') ?? INVOICE_DEFAULTS.footer,
  }
}

export const INVOICE_ORDER_INCLUDE = { items: { include: { variant: true } }, user: { select: { name: true } } } as const

// The fields the template needs, as plain JSON (dates as strings) so a client component can render it.
export function toInvoiceOrder(order: any): InvoiceOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: new Date(order.createdAt).toISOString(),
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    currency: order.currency || 'USD',
    email: order.email || '',
    phone: order.phone || '',
    userName: order.user?.name || '',
    shippingAddressJson: order.shippingAddressJson || '',
    shippingMethod: order.shippingMethod || '',
    subtotal: order.subtotal, discountTotal: order.discountTotal, shippingTotal: order.shippingTotal, taxTotal: order.taxTotal, grandTotal: order.grandTotal,
    items: (order.items || []).map((i: any) => ({ id: i.id, name: i.name, variant: i.variant?.name && !String(i.name).includes(i.variant.name) ? i.variant.name : '', quantity: i.quantity, unitPrice: i.unitPrice, totalPrice: i.totalPrice })),
  }
}

// A link the customer can open without an account (the same view code as the thank-you page).
export function customerInvoiceLink(order: { id: string; orderNumber: string }) {
  return `${siteUrl()}/invoice/${encodeURIComponent(order.id)}?t=${encodeURIComponent(orderViewToken(order.orderNumber))}`
}
