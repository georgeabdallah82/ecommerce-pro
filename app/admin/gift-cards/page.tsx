import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { db } from '@/lib/prisma'
import { config } from '@/lib/config'
import GiftCardsAdmin from '@/components/gift-cards-admin'

export default async function GiftCardsPage() {
  const user = await requirePermission('giftCards.view')
  const rows = await db.giftCard.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
  return <GiftCardsAdmin initial={JSON.parse(JSON.stringify(rows))} canManage={hasPermission(user.role, 'giftCards.manage')} defaultCurrency={config.currency} />
}
