import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import PosReceipt, { type ReceiptData } from '@/components/pos-receipt'

// A till receipt, for printing and reprinting. Only till sales have one.
export default async function PosReceiptPage({ params, searchParams }: { params: Promise<{ orderNumber: string }>; searchParams: Promise<{ width?: string }> }) {
  await requirePermission('orders.manage')
  const { orderNumber } = await params
  const { width } = await searchParams
  if (!/^[A-Za-z0-9-]{3,40}$/.test(orderNumber)) notFound()

  const order = await db.order.findUnique({
    where: { orderNumber },
    include: {
      items: true,
      paymentLines: true,
      location: { select: { name: true } },
      cashier: { select: { name: true } },
      shift: { select: { register: { select: { name: true } } } },
    },
  })
  if (!order || order.channel !== 'POS') notFound()

  const receipt: ReceiptData = {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    cashierName: order.cashier?.name ?? '',
    locationName: order.location?.name ?? '',
    registerName: order.shift?.register.name ?? '',
    subtotalCents: order.subtotal,
    discountCents: order.discountTotal,
    grandTotalCents: order.grandTotal,
    changeUsdCents: Math.max(0, order.paymentLines.reduce((sum, line) => sum + line.usdCents, 0) - order.grandTotal),
    exchangeRateLbp: order.exchangeRateLbp,
    items: order.items.map(item => ({ name: item.name, sku: item.sku, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: item.totalPrice })),
    payments: order.paymentLines.map(line => ({ method: line.method, currency: line.currency, amount: line.amount, reference: line.reference })),
  }
  return <PosReceipt receipt={receipt} widthMm={width === '58' ? 58 : 80} />
}
