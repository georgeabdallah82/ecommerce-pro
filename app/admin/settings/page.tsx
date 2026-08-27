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
  'email.fulfillment',
  'email.abandonedCheckout',
])

export default async function Settings() {
  await requirePermission('settings.view')
  const settings = await db.setting.findMany({
    where: { key: { in: Array.from(CLIENT_SETTING_KEYS) } },
    orderBy: { key: 'asc' },
  })
  return <SettingsCenterPro initial={settings} />
}
