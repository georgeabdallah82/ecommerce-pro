import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { draftInvoiceToken, safeTokenEqual } from '@/lib/payments'
import { money } from '@/lib/config'
import { notFound } from 'next/navigation'
import { Footer } from '@/components/footer'
import InvoicePayClient from '@/components/invoice-pay-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PayInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params
  const { token } = await searchParams
  const { theme } = await getThemeState()
  const draft = await db.draftOrder.findUnique({ where: { id }, include: { items: true } })
  if (!draft || !token || !safeTokenEqual(token, draftInvoiceToken(id))) notFound()

  return <>
    <div className="focalStorefront">
      <div className="aliContainer aliLegalPage" style={{ maxWidth: 640 }}>
        <h1>Invoice {draft.orderNumber}</h1>
        {draft.status === 'COMPLETED' ? (
          <p className="aliEmptyState">This invoice has already been paid. Thank you!</p>
        ) : draft.status === 'CANCELLED' ? (
          <p className="aliEmptyState">This invoice is no longer available.</p>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 10, margin: '24px 0' }}>
              {draft.items.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span>{item.name} × {item.quantity}</span>
                  <strong>{money(item.totalPrice, draft.currency)}</strong>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #eee', paddingTop: 12, fontWeight: 800, fontSize: 16 }}>
              <span>Total due</span>
              <span>{money(draft.grandTotal, draft.currency)}</span>
            </div>
            <InvoicePayClient draftOrderId={draft.id} token={token} />
          </>
        )}
      </div>
    </div>
    <Footer theme={theme} />
  </>
}
