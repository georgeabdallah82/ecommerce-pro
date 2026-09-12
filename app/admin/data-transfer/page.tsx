import { requirePermission } from '@/lib/auth'
import AdminDataTransfer from '@/components/admin-data-transfer'
import ui from '@/components/admin-ui.module.css'

export default async function DataTransfer() {
  const user = await requirePermission('reports.view')
  const canImport = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EDITOR'].includes(user.role)

  return <div>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>OPERATIONS & INSIGHTS</span>
        <h1 className={ui.title}>Data management</h1>
        <p className={ui.muted}>Safely import and export products, categories, and collections.</p>
      </div>
    </div>
    <AdminDataTransfer canImport={canImport} />
  </div>
}
