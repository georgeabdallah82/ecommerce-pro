import { db } from '@/lib/prisma'
import { getThemeState } from '@/lib/theme'
import { hasPushSubscription } from '@/lib/push'
import { LAUNCH_MANUAL_KEY, MANUAL_IDS, type LaunchFacts } from '@/lib/launch-checklist'

const KEYS = ['contact.phone', 'payment.cod', 'payment.card', 'checkout.freeShippingThreshold', 'maintenance.enabled', LAUNCH_MANUAL_KEY, 'tracking.metaPixelId', 'tracking.gaMeasurementId', 'tracking.tiktokPixelId']

export function parseManual(raw: string | null | undefined): Record<string, string> {
  try {
    const value = JSON.parse(raw || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([id, at]) => MANUAL_IDS.includes(id) && typeof at === 'string').map(([id, at]) => [id, String(at)]))
  } catch { return {} }
}

// Everything the checklist looks at, read from the store as it is right now (Admin > Launch
// checklist). Nothing here writes, and nothing leaves the database or the environment.
export async function launchFacts(user: { id: string; totpEnabledAt: Date | null }): Promise<LaunchFacts> {
  const [settings, themeState, shippingZones, activeProducts, productsWithoutPhoto, productsWithoutPrice, orderCount, phoneAlertsOn] = await Promise.all([
    db.setting.findMany({ where: { key: { in: KEYS } }, select: { key: true, value: true } }),
    getThemeState(),
    db.shippingZone.count({ where: { isActive: true, rates: { some: { isActive: true } } } }),
    db.product.count({ where: { status: 'ACTIVE' } }),
    db.product.count({ where: { status: 'ACTIVE', images: { none: {} } } }),
    db.product.count({ where: { status: 'ACTIVE', basePrice: { lte: 0 } } }),
    db.order.count(),
    hasPushSubscription(user.id).catch(() => false),
  ])
  const map = new Map(settings.map(s => [s.key, s.value]))
  const theme: any = themeState.theme || {}
  const announcement = (Array.isArray(theme.siteHeader) ? theme.siteHeader : []).find((section: any) => section?.type === 'announcement')
  const announcementText = String(announcement?.blocks?.[0]?.settings?.text || announcement?.settings?.text || theme.announcement?.text || '')
  const threshold = Number(map.get('checkout.freeShippingThreshold'))
  return {
    storeName: String(theme.brandName || ''),
    logoUrl: String(theme.logoUrl || ''),
    contactPhone: String(map.get('contact.phone') || ''),
    whatsappNumber: String(theme.whatsapp?.number || ''),
    codOn: map.get('payment.cod') !== 'false',
    cardOn: map.get('payment.card') === 'true',
    freeShippingThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : null,
    announcementText,
    shippingZones,
    activeProducts,
    productsWithoutPhoto,
    productsWithoutPrice,
    twoStepOn: Boolean(user.totpEnabledAt),
    phoneAlertsOn,
    emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    maintenanceOn: map.get('maintenance.enabled') === 'true',
    orderCount,
    arabicOn: theme.languages?.arabic === true,
    socialLinks: ['instagram', 'facebook', 'tiktok', 'twitter', 'youtube'].filter(k => String(theme.social?.[k] || '').trim()).length,
    adTracking: ['tracking.metaPixelId', 'tracking.gaMeasurementId', 'tracking.tiktokPixelId'].some(k => String(map.get(k) || '').trim()),
    footerText: String(theme.footer?.text || ''),
    manual: parseManual(map.get(LAUNCH_MANUAL_KEY)),
  }
}
