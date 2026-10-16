import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { getStoreTimezone } from '@/lib/store-timezone'
import { getStoreIdentity } from '@/lib/store-identity'
import { INVOICE_ORDER_INCLUDE, customerInvoiceLink, getInvoiceStore, toInvoiceOrder } from '@/lib/invoice'
import InvoiceWorkspace from '@/components/invoice-workspace'
import ui from '@/components/admin-ui.module.css'

// Admin > Orders > one order > Invoice: the invoice inside the admin (not the website), ready to
// print, save as PDF or send to the customer.
export default async function AdminInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('orders.view')
  const { id } = await params
  const [order, store, timezone, identity] = await Promise.all([
    db.order.findUnique({ where: { id }, include: INVOICE_ORDER_INCLUDE }),
    getInvoiceStore(),
    getStoreTimezone(),
    getStoreIdentity(),
  ])
  if (!order) return <div className={ui.empty}>Order not found.</div>
  return <InvoiceWorkspace mode="admin" order={toInvoiceOrder(order)} store={store} timezone={timezone} customerLink={customerInvoiceLink(order)} storeCountry={identity.country} canEditTemplate={hasPermission(user, 'settings.manage')}/>
}
