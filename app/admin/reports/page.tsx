import { requirePermission } from '@/lib/auth'
import AnalyticsAdmin from '@/components/analytics-admin'
import AdminDataTransfer from '@/components/admin-data-transfer'
import LiveVisitorsAdmin from '@/components/live-visitors-admin'

export default async function Reports() {
  const user = await requirePermission('reports.view')
  const canImport = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EDITOR'].includes(user.role)

  return <div className="space-y-10">
    <div>
      <div className="text-sm font-medium text-muted-foreground">Operations & insights</div>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Reports & Analytics</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Understand sales performance, inventory health, and what is happening on your storefront right now.</p>
    </div>
    <AnalyticsAdmin />
    <LiveVisitorsAdmin />
    <section className="border-t pt-10">
      <div className="mb-5"><h2 className="text-2xl font-semibold tracking-tight">Data management</h2><p className="mt-1 text-sm text-muted-foreground">Safely import and export products, categories, and collections.</p></div>
      <AdminDataTransfer canImport={canImport} />
    </section>
  </div>
}
