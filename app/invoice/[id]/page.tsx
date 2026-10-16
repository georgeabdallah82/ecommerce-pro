import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreTimezone } from '@/lib/store-timezone'
import { canViewOrder } from '@/lib/order-access'
import { INVOICE_ORDER_INCLUDE, getInvoiceStore, toInvoiceOrder } from '@/lib/invoice'
import InvoiceWorkspace from '@/components/invoice-workspace'

export const metadata: Metadata = { title: 'Invoice', robots: { index: false, follow: false } }

// The customer's copy of an invoice: the link staff send from Admin > Orders > Invoice
// (/invoice/<id>?t=<view code>), or the signed-in customer who placed the order; staff can open
// it too. Anyone else gets "not found" (no hint that the order exists).
export default async function CustomerInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ id }, { t }, viewer] = await Promise.all([params, searchParams, getCurrentUser().catch(() => null)])
  const order = await db.order.findUnique({ where: { id }, include: INVOICE_ORDER_INCLUDE })
  if (!order) notFound()
  const staff = !!viewer && hasPermission(viewer, 'orders.view')
  if (!staff && !canViewOrder(order, { userId: viewer?.id, token: t })) notFound()
  const [store, timezone] = await Promise.all([getInvoiceStore(), getStoreTimezone()])
  return <main><InvoiceWorkspace mode="customer" order={toInvoiceOrder(order)} store={store} timezone={timezone}/></main>
}
