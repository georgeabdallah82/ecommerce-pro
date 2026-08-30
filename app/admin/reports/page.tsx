import { requirePermission } from '@/lib/auth'
import AnalyticsAdmin from '@/components/analytics-admin'
import AdminDataTransfer from '@/components/admin-data-transfer'

export default async function Reports(){
  const user = await requirePermission('reports.view')
  const canImport = ['SUPER_ADMIN','ADMIN','MANAGER','EDITOR'].includes(user.role)
  return <div style={{paddingBottom:24}}>
    <AnalyticsAdmin />
    <section className="reportSection" style={{marginTop:28}}>
      <div className="sectionLabel" style={{display:'flex',justifyContent:'space-between',alignItems:'end',marginBottom:10}}>
        <div><h2 style={{margin:0,fontSize:17}}>Data management</h2><p className="muted" style={{margin:'4px 0 0',fontSize:12}}>Safely move catalog data between your store and CSV files.</p></div>
      </div>
      <AdminDataTransfer canImport={canImport} />
    </section>
  </div>
}
