import { requirePermission } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { db } from '@/lib/prisma'
import { json } from '@/lib/utils'
import { runPlatformHealth } from '@/lib/platform-health'

export async function POST() {
  try {
    const actor = await requirePermission('settings.manage')
    const repairs: string[] = []

    const publishFix = await db.product.updateMany({
      where: { status: 'ACTIVE', publishedAt: null },
      data: { publishedAt: new Date() },
    })
    if (publishFix.count) repairs.push(`Published ${publishFix.count} active product(s) missing publication timestamps.`)

    const couponFix = await db.coupon.updateMany({
      where: { isActive: true, expiresAt: { lt: new Date() } },
      data: { isActive: false },
    })
    if (couponFix.count) repairs.push(`Disabled ${couponFix.count} expired active coupon(s).`)

    await audit(actor.id, 'platform.repair', 'Platform', undefined, { repairs })
    const health = await runPlatformHealth()
    return json({ ok: true, repairs, health })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unable to repair platform state' }, { status: 400 })
  }
}
