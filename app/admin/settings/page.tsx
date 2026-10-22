import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import SettingsCenterPro from '@/components/settings-center-pro'
import { getThemeState, defaultTheme } from '@/lib/theme'
import { APP_ICON_LARGE, APP_ICON_SMALL, appIconSource } from '@/lib/app-icon'

const CLIENT_SETTING_KEYS = new Set([
  'store.name',
  'store.currency',
  'store.country',
  'store.timezone',
  'contact.email',
  'contact.phone',
  'store.address',
  'policy.returnDays',
  'policy.refundTime',
  'policy.damageReportHours',
  'policy.updatedAt',
  'seo.image',
  'checkout.freeShippingThreshold',
  'checkout.countries',
  'checkout.taxRatePercent',
  'seo.title',
  'seo.description',
  'payment.cod',
  'payment.card',
  'payment.bank',
  'payment.wallet',
  'checkout.guestCheckout',
  'notifications.orderEmail',
  'notifications.lowStock',
  'notifications.reviews',
  'notifications.security',
  'notifications.dailySummary',
  'notifications.weeklyReport',
  'notifications.summaryEmail',
  'email.customerOrder',
  'email.fromName',
  'email.fromAddress',
  'email.fulfillment',
  'email.abandonedCheckout',
  'email.giftCard',
  'email.returnStatus',
  'email.orderEdit',
  'email.reviewRequest',
  // Selling tools (lib/selling.ts)
  'currency.showLbp', 'currency.lbpRate', 'freeGift.enabled', 'freeGift.threshold', 'freeGift.productId', 'checkout.giftOption',
  'product.whatsappOrder', 'product.lowStockThreshold', 'welcome.enabled', 'welcome.code', 'welcome.title', 'welcome.delaySeconds', 'search.synonyms',
  'invite.enabled', 'invite.friendPercent', 'invite.reward', 'invite.rewardDays', 'product.questions',
  'orders.guestCancel.enabled', 'orders.guestCancel.minutes',
  'tracking.metaPixelId',
  'tracking.gaMeasurementId',
  'tracking.tiktokPixelId',
  'tracking.metaCapiTestCode',
  'maintenance.enabled',
  'maintenance.backBy',
  'maintenance.headline',
  'maintenance.message',
])

export default async function Settings() {
  await requirePermission('settings.view')
  const settings = await db.setting.findMany({
    where: { key: { in: Array.from(CLIENT_SETTING_KEYS) } },
    orderBy: { key: 'asc' },
  })
  // The Conversions API token is a secret: the page only learns whether one is saved.
  const capiToken = await db.setting.findUnique({ where: { key: 'tracking.metaCapiToken' } }).catch(() => null)
  // Phone app icon (components/app-icon-card.tsx): the saved one, or the logo it's made from.
  const [{ theme }, appIcons] = await Promise.all([
    getThemeState().catch(() => ({ theme: defaultTheme })),
    db.setting.findMany({ where: { key: { in: [APP_ICON_LARGE, APP_ICON_SMALL] } }, select: { key: true, value: true } }),
  ])
  const appIcon = {
    brandName: String(theme.brandName || '').trim(),
    source: appIconSource(theme),
    brandColor: String(theme.colors?.primary || ''),
    saved: { large: appIcons.find(r => r.key === APP_ICON_LARGE)?.value || '', small: appIcons.find(r => r.key === APP_ICON_SMALL)?.value || '' },
  }
  // The sender set for the deploy (wrangler.jsonc EMAIL_FROM): shown as the default, and its
  // domain is the one the sender address must use.
  // For the free-gift product list and the WhatsApp list link (Selling tools).
  const [products, whatsappListCount] = await Promise.all([
    db.product.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 1000 }),
    db.phoneSubscriber.count().catch(() => 0),
  ])
  return <SettingsCenterPro initial={settings} metaCapiTokenSet={!!capiToken?.value} emailFromDefault={process.env.EMAIL_FROM || ''} appIcon={appIcon} products={products} whatsappListCount={whatsappListCount} />
}
