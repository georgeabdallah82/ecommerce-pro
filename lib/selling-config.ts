import { db } from '@/lib/prisma'
import { storefrontCached } from '@/lib/storefront-cache'
import { SELLING_KEYS, SELLING_SETTING_KEYS, freeGiftConfig, giftOptionOn, lbpConfig, questionsOn, welcomeConfig, whatsappOrderOn } from '@/lib/selling'
import { inviteConfig, type InviteConfig } from '@/lib/invites-shared'
import { activeFlashSales, type FlashSale } from '@/lib/flash-sale'

export type SellingConfig = {
  lbp: { show: boolean; rate: number }
  freeGift: { threshold: number; productId: string; name: string; slug: string; image: string } | null
  giftOption: boolean
  whatsappOrder: boolean
  welcome: { enabled: boolean; code: string; title: string; delaySeconds: number }
  flashSales: FlashSale[]
  searchWords: string
  invite: InviteConfig
  questions: boolean
}

// What the store pages and checkout need to know about the selling tools, read once and shared
// for a short while (lib/storefront-cache.ts) like the theme.
export function getSellingConfig(): Promise<SellingConfig> {
  return storefrontCached('selling-config', async () => {
    const rows = await db.setting.findMany({ where: { key: { in: SELLING_SETTING_KEYS } }, select: { key: true, value: true } })
    const map = new Map(rows.map(r => [r.key, r.value]))
    const gift = freeGiftConfig(map)
    const [giftProduct, flashSales] = await Promise.all([
      gift.enabled ? db.product.findFirst({ where: { id: gift.productId, status: 'ACTIVE' }, select: { id: true, name: true, slug: true, images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 } } }) : null,
      activeFlashSales().catch(() => [] as FlashSale[]),
    ])
    return {
      lbp: lbpConfig(map),
      freeGift: giftProduct ? { threshold: gift.threshold, productId: giftProduct.id, name: giftProduct.name, slug: giftProduct.slug, image: giftProduct.images[0]?.url || '' } : null,
      giftOption: giftOptionOn(map),
      whatsappOrder: whatsappOrderOn(map),
      welcome: welcomeConfig(map),
      flashSales,
      searchWords: map.get(SELLING_KEYS.searchWords) || '',
      invite: inviteConfig(map),
      questions: questionsOn(map),
    }
  })
}
