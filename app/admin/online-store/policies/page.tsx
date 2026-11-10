import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { getThemeState } from '@/lib/theme'
import { config } from '@/lib/config'
import { getCustomPolicies, getPolicyVars } from '@/lib/policies'
import { db } from '@/lib/prisma'
import PoliciesAdmin from '@/components/policies-admin'

export default async function PoliciesPage() {
  const user = await requirePermission('content.view')
  const { theme } = await getThemeState()
  const [vars, custom, saved] = await Promise.all([
    getPolicyVars(theme.brandName || config.brand, theme.currency),
    getCustomPolicies(),
    // Which store details were typed in (the policies fall back to placeholders when they're not).
    db.setting.findMany({ where: { key: { in: ['contact.email', 'contact.phone', 'store.address', 'policy.returnDays', 'policy.refundTime', 'policy.damageReportHours'] } }, select: { key: true, value: true } }),
  ])
  const filled = new Map(saved.map(r => [r.key, String(r.value || '').trim() !== '']))
  const setup = {
    email: filled.get('contact.email') === true,
    phone: filled.get('contact.phone') === true,
    address: filled.get('store.address') === true,
    returnDays: filled.get('policy.returnDays') === true,
    refundTime: filled.get('policy.refundTime') === true,
    damageReportHours: filled.get('policy.damageReportHours') === true,
  }
  return <PoliciesAdmin vars={vars} custom={custom} setup={setup} canManage={hasPermission(user, 'content.manage')} />
}
