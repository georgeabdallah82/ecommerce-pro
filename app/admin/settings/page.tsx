import { requirePermission } from '@/lib/auth'
import { db } from '@/lib/prisma'
import SettingsCenterPro from '@/components/settings-center-pro'

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
  'email.customerOrder',
  'email.fromName',
  'email.fromAddress',
  'email.fulfillment',
  'email.abandonedCheckout',
  'email.giftCard',
  'email.returnStatus',
  'email.orderEdit',
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
  // The sender set for the deploy (wrangler.jsonc EMAIL_FROM): shown as the default, and its
  // domain is the one the sender address must use.
  return <SettingsCenterPro initial={settings} metaCapiTokenSet={!!capiToken?.value} emailFromDefault={process.env.EMAIL_FROM || ''} />
}
