import { db } from '@/lib/prisma'
import { config } from '@/lib/config'
import { getContactInfo, getPolicyInfo } from '@/lib/store-contact'
import { defaultPolicyHtml, type PolicyKind, type PolicyVars } from '@/lib/policy-templates'

// Online Store › Policies. Each policy page shows the merchant's own text when they wrote one
// (policy.<kind>.html, sanitized when shown), otherwise our default wording filled in from
// Settings. returns.enabled = 'false' means the store doesn't take returns: customers can't
// request one and the default refund policy says all sales are final.
export const POLICY_KINDS: PolicyKind[] = ['refund', 'privacy', 'terms']
export const policyKey = (kind: PolicyKind) => `policy.${kind}.html`

export async function getReturnsEnabled() {
  const row = await db.setting.findUnique({ where: { key: 'returns.enabled' } }).catch(() => null)
  return row?.value !== 'false'
}

export async function getPolicyVars(brand: string, currency?: string): Promise<PolicyVars> {
  const [contact, policy, returnsEnabled] = await Promise.all([getContactInfo(), getPolicyInfo(), getReturnsEnabled()])
  return { brand, currency: currency || config.currency, country: contact.country, phone: contact.phone, returnDays: policy.returnDays, refundTime: policy.refundTime, damageReportHours: policy.damageReportHours, returnsEnabled }
}

export async function getCustomPolicies(): Promise<Record<PolicyKind, string>> {
  const rows = await db.setting.findMany({ where: { key: { in: POLICY_KINDS.map(policyKey) } }, select: { key: true, value: true } })
  const map = new Map(rows.map(r => [r.key, r.value]))
  return { refund: map.get(policyKey('refund')) || '', privacy: map.get(policyKey('privacy')) || '', terms: map.get(policyKey('terms')) || '' }
}

export async function getPolicyHtml(kind: PolicyKind, vars: PolicyVars) {
  const custom = (await getCustomPolicies())[kind]
  return { html: custom.trim() ? custom : defaultPolicyHtml(kind, vars), custom: Boolean(custom.trim()) }
}
