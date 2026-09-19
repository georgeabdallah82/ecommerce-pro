import { db } from '@/lib/prisma'
import { config } from '@/lib/config'

// The admin Settings "Store email" / "Phone / WhatsApp" fields (contact.email,
// contact.phone) are meant to let a merchant override the build-time
// NEXT_PUBLIC_SUPPORT_EMAIL / NEXT_PUBLIC_WHATSAPP_NUMBER env vars without a
// redeploy -- same "DB setting overrides env fallback" pattern as
// getTaxRatePercent/resolveFreeShippingThresholdCents in lib/pricing.ts.
// Server-only (imports db), so pages/routes call this directly rather than
// pulling it through lib/config.ts, which client components also import.
export async function getContactInfo() {
  const rows = await db.setting.findMany({ where: { key: { in: ['contact.email', 'contact.phone'] } }, select: { key: true, value: true } })
  const map = Object.fromEntries(rows.map(row => [row.key, row.value]))
  return {
    email: map['contact.email']?.trim() || config.supportEmail,
    phone: map['contact.phone']?.trim() || config.whatsapp,
  }
}
