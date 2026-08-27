import { db } from '@/lib/prisma'
import { createHash } from 'node:crypto'
import { areebaMpgsPaymentProvider } from '@/lib/payments'

function webhookToken() { const secret = process.env.AUTH_SECRET; if (!secret) throw new Error('AUTH_SECRET is required'); return createHash('sha256').update(`areeba-webhook:${secret}`).digest('hex') }

async function process(orderNumber: string) {
  const order = await db.order.findUnique({ where: { orderNumber }, select: { id: true, orderNumber: true, grandTotal: true, currency: true, paymentStatus: true } })
  if (!order) return false
  const transaction = await db.paymentTransaction.findFirst({ where: { orderId: order.id, provider: 'areeba_mpgs' }, orderBy: { createdAt: 'desc' } })
  if (!transaction?.externalId || transaction.amount !== order.grandTotal || transaction.currency !== order.currency) return false
  const status = await areebaMpgsPaymentProvider.getPaymentStatus(transaction.externalId, orderNumber)
  if (status === 'paid') {
    await db.$transaction(async tx => {
      const current = await tx.order.findUnique({ where: { id: order.id }, select: { paymentStatus: true } })
      if (current?.paymentStatus !== 'PAID') await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } })
      await tx.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'paid' } })
    })
  } else if (status === 'failed' && order.paymentStatus !== 'PAID') {
    await db.$transaction(async tx => {
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } })
      await tx.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'failed' } })
    })
  }
  return true
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    if (url.searchParams.get('token') !== webhookToken()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, any>
    const orderNumber = typeof body.order?.id === 'string' ? body.order.id.trim() : typeof body.orderId === 'string' ? body.orderId.trim() : ''
    if (!orderNumber) return Response.json({ error: 'order.id is required' }, { status: 400 })
    await process(orderNumber)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 200 })
  }
}
