import { requirePermission } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { getThemeState } from '@/lib/theme'
import { config } from '@/lib/config'
import { getCustomPolicies, getPolicyVars } from '@/lib/policies'
import PoliciesAdmin from '@/components/policies-admin'

export default async function PoliciesPage() {
  const user = await requirePermission('content.view')
  const { theme } = await getThemeState()
  const [vars, custom] = await Promise.all([getPolicyVars(theme.brandName || config.brand, theme.currency), getCustomPolicies()])
  return <PoliciesAdmin vars={vars} custom={custom} canManage={hasPermission(user, 'content.manage')} />
}
