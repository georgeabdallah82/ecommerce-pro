import { requirePermission } from '@/lib/auth'
import { buildChecklist } from '@/lib/launch-checklist'
import { launchFacts } from '@/lib/launch-facts'
import LaunchChecklist from '@/components/launch-checklist'

// Everything to check before the store opens to visitors, ticking itself from the store's own
// settings (lib/launch-checklist.ts). Owner only (settings.manage).
export default async function LaunchChecklistPage() {
  const user = await requirePermission('settings.manage')
  const facts = await launchFacts(user)
  return <LaunchChecklist initial={JSON.parse(JSON.stringify(buildChecklist(facts)))} maintenanceOn={facts.maintenanceOn} />
}
