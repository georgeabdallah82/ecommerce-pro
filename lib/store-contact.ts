import { db } from '@/lib/prisma'
import { config } from '@/lib/config'
import { POLICY_DEFAULTS, POLICY_TEXT_DATE } from '@/lib/policy-defaults'

// The admin Settings "Store email" / "Phone / WhatsApp" fields (contact.email,
// contact.phone) are meant to let a merchant override the build-time
// NEXT_PUBLIC_SUPPORT_EMAIL / NEXT_PUBLIC_WHATSAPP_NUMBER env vars without a
// redeploy -- same "DB setting overrides env fallback" pattern as
// getTaxRatePercent/resolveFreeShippingThresholdCents in lib/pricing.ts.
// Server-only (imports db), so pages/routes call this directly rather than
// pulling it through lib/config.ts, which client components also import.
export async function getContactInfo() {
  const rows = await db.setting.findMany({ where: { key: { in: ['contact.email', 'contact.phone', 'store.country', 'store.address'] } }, select: { key: true, value: true } })
  const map = Object.fromEntries(rows.map(row => [row.key, row.value]))
  return {
    email: map['contact.email']?.trim() || config.supportEmail,
    phone: map['contact.phone']?.trim() || config.whatsapp,
    country: map['store.country']?.trim() || config.country,
    address: map['store.address']?.trim() || config.businessAddress,
  }
}

export async function getPolicyInfo() {
  const rows = await db.setting.findMany({ where: { key: { in: ['policy.returnDays', 'policy.refundTime', 'policy.damageReportHours', 'policy.updatedAt'] } }, select: { key: true, value: true } })
  const map = Object.fromEntries(rows.map(row => [row.key, row.value?.trim()]))
  const saved = map['policy.updatedAt'] && !Number.isNaN(Date.parse(map['policy.updatedAt'])) ? map['policy.updatedAt'] : ''
  const updatedAt = saved && saved > POLICY_TEXT_DATE ? saved : POLICY_TEXT_DATE
  return {
    returnDays: map['policy.returnDays'] || POLICY_DEFAULTS.returnDays,
    refundTime: map['policy.refundTime'] || POLICY_DEFAULTS.refundTime,
    damageReportHours: map['policy.damageReportHours'] || POLICY_DEFAULTS.damageReportHours,
    updated: new Date(`${updatedAt.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
  }
}
