import { getCurrentUser } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { sendCustomerPushCampaign } from '@/lib/push'

async function adminUser() {
  const user = await getCurrentUser()
  if (!user || !hasPermission(user.role, 'settings.view')) return null
  return user
}

function safeUrl(value: unknown) {
  const url = String(value || '/').trim()
  if (url === '/' || url.startsWith('/')) return url
  if (/^https:\/\//i.test(url)) return url
  throw new Error('Action URL must be a site path or HTTPS URL')
}

export async function GET() {
  const user = await adminUser()
  if (!user) return json({ error: 'Forbidden' }, { status: 403 })
  const [customers, recent] = await Promise.all([
    db.user.findMany({ where: { role: 'CUSTOMER', isActive: true }, select: { id: true, name: true, email: true }, orderBy: { createdAt: 'desc' }, take: 500 }),
    db.notification.findMany({ where: { type: 'MARKETING_PUSH' }, select: { id: true, userId: true, title: true, body: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ])
  return json({ customers, recent })
}

export async function POST(req: Request) {
  try {
    const user = await adminUser()
    if (!user) return json({ error: 'Forbidden' }, { status: 403 })
    const body = await req.json()
    const title = String(body?.title || '').trim()
    const message = String(body?.message || body?.body || '').trim()
    const audience = body?.audience === 'selected' ? 'selected' : 'all'
    const rawIds = Array.isArray(body?.customerIds) ? body.customerIds.map((id: unknown) => String(id)).filter(Boolean) : []
    if (!title || title.length > 80) return json({ error: 'Title is required and must be 80 characters or fewer' }, { status: 400 })
    if (!message || message.length > 240) return json({ error: 'Message is required and must be 240 characters or fewer' }, { status: 400 })
    if (audience === 'selected' && !rawIds.length) return json({ error: 'Select at least one customer' }, { status: 400 })
    const actionUrl = safeUrl(body?.url)

    const customers = await db.user.findMany({
      where: audience === 'selected' ? { id: { in: rawIds }, role: 'CUSTOMER', isActive: true } : { role: 'CUSTOMER', isActive: true },
      select: { id: true },
    })
    if (!customers.length) return json({ error: 'No eligible customers were found' }, { status: 400 })
    const customerIds = customers.map(customer => customer.id)

    await db.notification.createMany({ data: customerIds.map(customerId => ({ userId: customerId, title, body: message, type: 'MARKETING_PUSH' })) })
    const result = await sendCustomerPushCampaign({ title, body: message, url: actionUrl, icon: typeof body?.icon === 'string' ? body.icon.slice(0, 500) : undefined }, customerIds)
    await db.auditLog.create({ data: { actorId: user.id, action: 'MARKETING_PUSH_SENT', entity: 'Notification', metadataJson: JSON.stringify({ title, audience, requestedCustomers: customerIds.length, ...result }) } }).catch(() => undefined)
    return json({ ok: true, requestedCustomers: customerIds.length, ...result })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to send customer notification' }, { status: 400 })
  }
}
