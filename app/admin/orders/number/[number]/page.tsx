import { notFound, redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'

// /admin/orders/number/1042: opens the order with that number (links in Team chat, "#1042").
export default async function OrderByNumber({ params }: { params: Promise<{ number: string }> }) {
  await requirePermission('orders.view')
  const raw = decodeURIComponent((await params).number || '').trim().replace(/^#\s*/, '').toUpperCase().slice(0, 60)
  if (!/^[A-Z0-9-]{1,60}$/.test(raw)) notFound()
  const order = await db.order.findUnique({ where: { orderNumber: raw }, select: { id: true } })
  if (!order) notFound()
  redirect(`/admin/orders/${order.id}`)
}
