// Settings > General > Policies. Defaults are common, customer-friendly terms so the policy
// pages read as finished text before the merchant has looked at them. Client-safe (no db),
// so the admin settings form shares the same defaults as the storefront pages.
export const POLICY_DEFAULTS = { returnDays: '14', refundTime: '5–10 business days', damageReportHours: '48' }
// The policy wording itself last changed on this date; saving a policy value in Settings
// records a later one (policy.updatedAt).
export const POLICY_TEXT_DATE = '2026-10-02'
