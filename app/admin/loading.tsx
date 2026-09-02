import AdminRouteStateStyles from '@/components/admin-route-state-styles'

export default function AdminLoading(){
  return <div className="adminRouteState"><AdminRouteStateStyles/><div className="adminRouteSpinner" aria-hidden="true"/><div><strong>Loading workspace</strong><p>Preparing this section…</p></div></div>
}
