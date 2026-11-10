import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import SettingsCenterPro from '@/components/settings-center-pro'
import { getThemeState, defaultTheme } from '@/lib/theme'
import { APP_ICON_LARGE, APP_ICON_SMALL, appIconSource } from '@/lib/app-icon'
import { isReadableSecret } from '@/lib/secret-settings'

const CLIENT_SETTING_KEYS = new Set([
  'store.name',
  'store.currency',
  'store.country',
  'store.timezone',
  'contact.email',
  'contact.phone',
  'store.address',
  'stores.list',
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
  'payment.bank.label',
  'payment.bank.name',
  'payment.bank.accountName',
  'payment.bank.iban',
  'payment.bank.instructions',
  'checkout.guestCheckout',
  'notifications.orderEmail',
  'notifications.lowStock',
  'notifications.reviews',
  'notifications.security',
  'notifications.orderProblems',
  'notifications.stuckOrderMinutes',
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
  'tracking.metaPixelId',
  'tracking.gaMeasurementId',
  'tracking.tiktokPixelId',
  'tracking.googleAdsId',
  'tracking.googleAdsPurchaseLabel',
  'tracking.metaCapiTestCode',
  'maintenance.enabled',
  'maintenance.mode',
  'maintenance.backBy',
  'maintenance.headline',
  'maintenance.message',
])

export default async function Settings({ searchParams }: { searchParams: Promise<{ addWord?: string }> }) {
  // From Admin > Analytics > Searches: "Add a search word" opens the Selling tab with the term ready to finish.
  const addWord = String((await searchParams).addWord || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80)
  await requirePermission('settings.view')
  const settings = await db.setting.findMany({
    where: { key: { in: Array.from(CLIENT_SETTING_KEYS) } },
    orderBy: { key: 'asc' },
  })
  // The Conversions API token is a secret: the page only learns whether one is saved.
  const capiToken = await db.setting.findUnique({ where: { key: 'tracking.metaCapiToken' } }).catch(() => null)
  const metaCapiTokenUnreadable = !!capiToken?.value && !(await isReadableSecret(capiToken.value))
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
  return <SettingsCenterPro addSearchWord={addWord || undefined} initial={settings} metaCapiTokenSet={!!capiToken?.value} metaCapiTokenUnreadable={metaCapiTokenUnreadable} emailFromDefault={process.env.EMAIL_FROM || ''} appIcon={appIcon} products={products} whatsappListCount={whatsappListCount} />
}
