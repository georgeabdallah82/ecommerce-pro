import { db } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { sendDraftOrderInvoiceEmail } from '@/lib/email'
import { draftInvoiceToken } from '@/lib/payments'
import { json } from '@/lib/utils'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('orders.manage')
    const { id } = await params
    const draft = await db.draftOrder.findUnique({ where: { id } })
    if (!draft) return json({ error: 'Draft order not found' }, { status: 404 })
    if (draft.status === 'COMPLETED' || draft.status === 'CANCELLED') return json({ error: 'Only open draft orders can be invoiced' }, { status: 409 })

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
    if (!siteUrl) return json({ error: 'NEXT_PUBLIC_SITE_URL is required to send invoices' }, { status: 400 })
    const payUrl = `${siteUrl}/pay-invoice/${draft.id}?token=${encodeURIComponent(draftInvoiceToken(draft.id))}`

    if (draft.status === 'DRAFT') await db.draftOrder.update({ where: { id }, data: { status: 'OPEN' } })
    const result = await sendDraftOrderInvoiceEmail(draft.id, payUrl)
    if (!result.sent) return json({ error: 'Unable to send invoice email' }, { status: 400 })
    const updated = await db.draftOrder.update({ where: { id }, data: { invoiceSentAt: new Date() } })
    await audit(actor.id, 'draft_order.invoice_sent', 'DraftOrder', id, { email: draft.email })
    return json({ draftOrder: updated })
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Unable to send invoice' }, { status: 400 }) }
}
