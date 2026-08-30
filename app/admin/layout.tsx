import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { hasPermission, type Permission } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import OrderAlerts from '@/components/order-alerts'
import AdminSidebar, { type AdminSidebarGroup } from '@/components/admin-sidebar'
import { LogOut, Store, ShieldCheck } from 'lucide-react'

const groups: AdminSidebarGroup[] = [
  { id: 'home', label: 'Home', items: [
    { href: '/admin', label: 'Dashboard', permission: 'dashboard.view', icon: 'dashboard' },
  ]},
  { id: 'orders', label: 'Orders', items: [
    { href: '/admin/orders', label: 'Orders', permission: 'orders.view', icon: 'orders' },
  ]},
  { id: 'products', label: 'Products', items: [
    { href: '/admin/products', label: 'Products', permission: 'products.view', icon: 'products' },
    { href: '/admin/inventory', label: 'Inventory', permission: 'inventory.view', icon: 'inventory' },
    { href: '/admin/operations', label: 'Operations', permission: 'inventory.view', icon: 'operations' },
  ]},
  { id: 'collections', label: 'Collections', items: [
    { href: '/admin/collections', label: 'Collections', permission: 'collections.view', icon: 'collections' },
    { href: '/admin/categories', label: 'Categories', permission: 'categories.view', icon: 'categories' },
  ]},
  { id: 'customers', label: 'Customers', items: [
    { href: '/admin/customers', label: 'Customers', permission: 'customers.view', icon: 'customers' },
  ]},
  { id: 'content', label: 'Content', items: [
    { href: '/admin/content', label: 'Content', permission: 'content.view', icon: 'content' },
    { href: '/admin/media', label: 'Files', permission: 'media.view', icon: 'files' },
    { href: '/admin/reviews', label: 'Reviews', permission: 'reviews.view', icon: 'reviews' },
  ]},
  { id: 'online-store', label: 'Online Store', items: [
    { href: '/admin/online-store', label: 'Overview', permission: 'content.view', icon: 'store' },
    { href: '/admin/online-store/theme-editor', label: 'Theme editor', permission: 'content.view', icon: 'theme' },
    { href: '/admin/online-store/navigation', label: 'Navigation', permission: 'content.view', icon: 'navigation' },
  ]},
  { id: 'marketing', label: 'Discounts', items: [
    { href: '/admin/coupons', label: 'Discounts', permission: 'coupons.view', icon: 'discounts' },
  ]},
  { id: 'analytics', label: 'Analytics', items: [
    { href: '/admin/reports', label: 'Analytics & reports', permission: 'reports.view', icon: 'analytics' },
  ]},
  { id: 'settings', label: 'Settings', items: [
    { href: '/admin/shipping', label: 'Shipping', permission: 'shipping.view', icon: 'shipping' },
    { href: '/admin/system', label: 'System health', permission: 'settings.view', icon: 'system' },
    { href: '/admin/users', label: 'Users & roles', permission: 'users.view', icon: 'users' },
    { href: '/admin/activity', label: 'Activity log', permission: 'activity.view', icon: 'activity' },
    { href: '/admin/settings', label: 'Settings', permission: 'settings.view', icon: 'settings' },
  ]},
]

const adminCss = `
body:has(.adminShell) { background:#f6f6f4; }
body:has(.adminShell) > .nav, body:has(.adminShell) .nav { display:none !important; }
body:has(.adminShell) .adminShell { min-height:100vh; grid-template-columns:250px minmax(0,1fr); background:#f6f6f4; }
body:has(.adminShell) .adminSide { position:sticky; top:0; height:100vh; padding:18px 14px; background:#fff; border-right:1px solid #e5e5e0; overflow:auto; }
body:has(.adminShell) .adminSide nav { margin-top:12px; }
body:has(.adminShell) .adminSide nav a { display:flex; align-items:center; gap:10px; height:42px; padding:0 12px; margin:3px 0; border-radius:10px; color:#5d5d59; font-size:14px; font-weight:600; transition:background .15s ease,color .15s ease,transform .15s ease; }
body:has(.adminShell) .adminSide nav a:hover { background:#f1f1ed; color:#171717; transform:translateX(1px); }
body:has(.adminShell) .adminSide nav a svg { flex:none; opacity:.85; }
body:has(.adminShell) .adminSideBottom { margin-top:14px; padding-top:14px; }
body:has(.adminShell) .adminSideBottom a, body:has(.adminShell) .sideButton { height:40px; font-size:13px; }
.adminNavTree{margin-top:10px;display:grid;gap:3px}.adminNavGroup{display:grid;gap:2px}.adminNavGroupButton{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;height:38px;padding:0 11px;border:0;background:transparent;border-radius:9px;color:#3f3f3b;font:inherit;font-size:13px;font-weight:700;cursor:pointer;text-align:left}.adminNavGroupButton:hover{background:#f3f3ef;color:#171717}.adminNavGroupButton.active{color:#171717;background:#f0f0ec}.adminNavChevron{transition:transform .16s ease;opacity:.65}.adminNavChevron.open{transform:rotate(180deg)}.adminNavChildren{display:grid;grid-template-rows:0fr;overflow:hidden;transition:grid-template-rows .16s ease}.adminNavChildren.open{grid-template-rows:1fr}.adminNavChildren > *{min-height:0}.adminNavItem{height:38px !important;margin:1px 0 !important;padding:0 11px 0 27px !important;border-radius:9px !important;font-size:13px !important;font-weight:600 !important;color:#666661 !important}.adminNavItem:hover{background:#f5f5f1 !important;color:#171717 !important;transform:none !important}.adminNavItem.active{background:#e8e8e3 !important;color:#111 !important;box-shadow:inset 2px 0 0 #171717}.adminNavGroup.active > .adminNavGroupButton{color:#171717}.adminNavGroup + .adminNavGroup{margin-top:2px}
body:has(.adminShell) .adminMain { min-width:0; padding:0 34px 48px; }
body:has(.adminShell) .adminTopbar { position:sticky; top:0; z-index:40; min-height:76px; padding:0; margin:0 0 28px; background:rgba(246,246,244,.94); backdrop-filter:blur(14px); border-bottom:1px solid #e6e6e2; }
body:has(.adminShell) .adminTopbar > div:first-child { padding:12px 0; }
body:has(.adminShell) .adminBrand .logo { font-size:16px; letter-spacing:-.03em; }
body:has(.adminShell) .adminBrandMark { width:36px; height:36px; border-radius:11px; }
body:has(.adminShell) .pill { border:1px solid #e6e6e0; background:#fff; color:#4d4d48; }
body:has(.adminShell) .sectionHead { margin-bottom:22px; }
body:has(.adminShell) .catalogPage, body:has(.adminShell) .operationsPage { max-width:1480px; margin:0 auto; }
body:has(.adminShell) .catalogHead { align-items:center; }
body:has(.adminShell) .catalogHead .h2 { font-size:38px; letter-spacing:-.045em; }
body:has(.adminShell) .catalogHead .muted { font-size:14px; }
body:has(.adminShell) .catalogStats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:0 0 16px; }
body:has(.adminShell) .statCard { appearance:none; width:100%; padding:16px 18px; border:1px solid #e4e4df; border-radius:14px; background:#fff; text-align:left; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,.03); transition:border .15s ease,box-shadow .15s ease,transform .15s ease; }
body:has(.adminShell) .statCard:hover { border-color:#cfcfc8; box-shadow:0 5px 18px rgba(0,0,0,.05); transform:translateY(-1px); }
body:has(.adminShell) .statCard.active { border-color:#171717; box-shadow:0 0 0 1px #171717 inset; }
body:has(.adminShell) .statCard span { display:block; font-size:12px; }
body:has(.adminShell) .statCard strong { display:block; margin-top:6px; font-size:25px; line-height:1; letter-spacing:-.03em; }
body:has(.adminShell) .catalogToolbar { display:grid; grid-template-columns:minmax(320px,1.4fr) auto minmax(300px,.9fr); gap:10px; align-items:center; padding:12px; margin-bottom:14px; border-radius:15px; overflow:visible; box-shadow:0 1px 2px rgba(0,0,0,.02); }
body:has(.adminShell) .productSearch { max-width:none; height:44px; border-radius:10px; }
body:has(.adminShell) .catalogFilters { display:grid; grid-template-columns:1fr 1fr auto; gap:10px; align-items:center; }
body:has(.adminShell) .catalogFilters .input { min-width:0; }
body:has(.adminShell) .mobileFilterBtn { display:none; }
body:has(.adminShell) .catalogToolbar .btn { min-height:44px; }
body:has(.adminShell) .bulkBar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 12px; margin-bottom:12px; border:1px solid #d9d9d2; border-radius:12px; background:#fff; position:sticky; top:78px; z-index:25; box-shadow:0 6px 18px rgba(0,0,0,.05); }
body:has(.adminShell) .productTableCard { border-radius:15px; box-shadow:0 1px 2px rgba(0,0,0,.03); }
body:has(.adminShell) .tableTopline { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid #ededeb; }
body:has(.adminShell) .tableTopline .input.compact { height:34px; min-width:74px; }
body:has(.adminShell) .productTable { min-width:980px; }
body:has(.adminShell) .productTable th { background:#fbfbf9; padding:12px 14px; font-size:11px; text-transform:uppercase; letter-spacing:.06em; border-bottom:1px solid #e8e8e3; }
body:has(.adminShell) .productTable td { padding:13px 14px; height:68px; vertical-align:middle; }
body:has(.adminShell) .productTable tbody tr:hover { background:#fcfcfa; }
body:has(.adminShell) .productTable tbody tr.selectedRow { background:#f3f3ef; }
body:has(.adminShell) .productListName { min-width:280px; }
body:has(.adminShell) .productThumb { width:48px; height:48px; border-radius:10px; background:#f5f5f1; }
body:has(.adminShell) .productThumb span { color:#999; font-size:20px; }
body:has(.adminShell) .productThumb img { object-fit:cover; }
body:has(.adminShell) .statusPill { padding:6px 9px; border:1px solid transparent; }
body:has(.adminShell) .stockCell { display:grid; gap:2px; }
body:has(.adminShell) .stockCell strong { font-size:14px; }
body:has(.adminShell) .stockCell span { font-size:11px; }
body:has(.adminShell) .table .iconBtn { width:34px; height:34px; border-radius:9px; }
body:has(.adminShell) .catalogPagination { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-top:1px solid #ededeb; }
body:has(.adminShell) .alert { margin-bottom:12px; }
body:has(.adminShell) .btn { box-shadow:0 1px 1px rgba(0,0,0,.04); transition:transform .15s ease,box-shadow .15s ease; }
body:has(.adminShell) .btn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 5px 14px rgba(0,0,0,.08); }
body:has(.adminShell) .btn:disabled { opacity:.55; cursor:not-allowed; }
body:has(.adminShell) .input:focus, body:has(.adminShell) .textarea:focus { outline:none; border-color:#8e8e87; box-shadow:0 0 0 3px rgba(23,23,23,.06); }
.operationsPage{padding-bottom:24px}.opsTabs{display:flex;gap:4px;overflow:auto;padding:4px;margin-bottom:16px;border:1px solid #e4e4df;background:#fff;border-radius:12px}.opsTabs button{border:0;background:transparent;padding:10px 14px;border-radius:8px;font:inherit;font-weight:600;color:#6a6a64;white-space:nowrap;cursor:pointer}.opsTabs button.active{background:#171717;color:#fff}.opsGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.opsGrid.wide{grid-template-columns:repeat(2,minmax(0,1fr))}.opsCard{display:flex;align-items:center;gap:12px;padding:18px;background:#fff;border:1px solid #e4e4df;border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.03)}.opsCard.attention{border-color:#ead9a4}.opsCardIcon{display:grid;place-items:center;width:40px;height:40px;border-radius:11px;background:#f2f2ed;color:#3d3d38}.opsCount{display:block;margin-top:5px;font-size:26px;letter-spacing:-.03em}.opsLabel{font-size:12px}.opsPanel{padding:20px}.opsPanel h3{margin:0 0 5px;font-size:17px}.opsActions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.opsList{display:grid;gap:8px;margin-top:16px}.opsRow{display:grid;grid-template-columns:minmax(0,1.5fr) auto minmax(100px,.8fr);align-items:center;gap:12px;padding:11px 12px;background:#fafaf8;border:1px solid #ecece7;border-radius:10px;font-size:13px}.opsLoading{padding:24px;text-align:center}.operationsPage .empty{padding:24px;text-align:center;color:#777}.healthGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.healthHero{display:flex;justify-content:space-between;gap:24px;align-items:center;padding:22px 24px;margin:8px 0 18px}.healthTimestamp{font-size:12px;color:#73736e;margin-top:10px}.healthTotals{display:flex;gap:24px}.healthTotals div{display:grid;gap:4px;min-width:74px}.healthTotals strong{font-size:28px;line-height:1}.healthTotals span{font-size:11px;color:#777}.healthCheck{padding:18px}.healthCheckHead{display:flex;align-items:center;gap:8px}.healthCheckHead strong{font-size:14px}.healthCheckDetail{margin-top:8px;font-size:12px;color:#777}.healthCheckOk{color:#1c7c54}.healthCheckWarn{color:#9a6a00}.healthCheckBad{color:#b33838}
@media(max-width:1100px){body:has(.adminShell) .catalogToolbar{grid-template-columns:1fr}.healthGrid{grid-template-columns:1fr 1fr}.opsGrid{grid-template-columns:1fr 1fr}}
@media(max-width:760px){body:has(.adminShell) .adminShell{display:block}.adminSide{display:none}.adminMain{padding:0 16px 40px !important}.adminTopbar{min-height:72px !important;margin-bottom:18px !important}.adminTopbar > div{gap:8px}.adminTopbar .inline{gap:6px;flex-wrap:wrap;justify-content:flex-end}.adminTopbar .pill{max-width:170px;overflow:hidden;text-overflow:ellipsis}.healthGrid{grid-template-columns:1fr}.opsGrid,.opsGrid.wide{grid-template-columns:1fr}.catalogStats{grid-template-columns:1fr 1fr !important}.catalogToolbar{grid-template-columns:1fr !important}.catalogFilters{grid-template-columns:1fr !important}.mobileFilterBtn{display:inline-flex !important}.productTableCard{overflow:auto}.productTable{min-width:860px}.catalogHead .h2{font-size:30px !important}}
`

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/admin')
  const visibleGroups = groups.map(group => ({
    ...group,
    items: group.items.filter(item => hasPermission(user.role, item.permission as Permission)),
  })).filter(group => group.items.length)

  return <>
    <style dangerouslySetInnerHTML={{__html:adminCss}} />
    <div className="adminShell">
      <aside className="adminSide">
        <div className="adminBrand"><div className="adminBrandMark"><ShieldCheck size={20}/></div><div><div className="logo">Control Center</div><div className="muted" style={{fontSize:12}}>Store operations</div></div></div>
        <div className="pill" style={{margin:'18px 0'}}>{user.role}</div>
        <AdminSidebar groups={visibleGroups} />
        <div className="adminSideBottom"><Link href="/"><Store size={16}/> View storefront</Link><form action="/api/auth/logout" method="post"><button className="sideButton" type="submit"><LogOut size={16}/> Sign out</button></form></div>
      </aside>
      <section className="adminMain"><header className="adminTopbar"><div><div className="muted" style={{fontSize:12}}>SIGNED IN AS</div><strong>{user.name}</strong></div><div className="inline"><OrderAlerts vapidPublicKey={process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}/><div className="pill">{user.email}</div></div></header>{children}</section>
    </div>
  </>
}
