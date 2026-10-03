import './admin-overhaul.css'
import { getCurrentUser } from '@/lib/auth'
import { hasPermission, type Permission } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import AdminNav, { type AdminSidebarGroup } from '@/components/admin-nav'
import { ToastProvider } from '@/components/admin-toast'
import { ConfirmProvider } from '@/components/admin-confirm'
import { getThemeState } from '@/lib/theme'
import { adminBrandCss } from '@/lib/admin-accent'
import { db } from '@/lib/prisma'
import { OrderStatus } from '@prisma/client'
import { builtInRoleName } from '@/lib/permission-groups'
import { getStaffRoles } from '@/lib/staff-roles'

const groups: AdminSidebarGroup[] = [
  { id: 'home', label: 'Home', items: [
    { href: '/admin', label: 'Dashboard', permission: 'dashboard.view', icon: 'dashboard' },
  ]},
  { id: 'orders', label: 'Orders', items: [
    { href: '/admin/orders', label: 'Orders', permission: 'orders.view', icon: 'orders' },
    { href: '/admin/draft-orders', label: 'Draft orders', permission: 'draftOrders.view', icon: 'draftOrders' },
    { href: '/admin/returns', label: 'Returns', permission: 'returns.view', icon: 'returns' },
    { href: '/admin/order-edits', label: 'Order edits', permission: 'orderEdits.view', icon: 'orderEdits' },
  ]},
  { id: 'products', label: 'Products', items: [
    { href: '/admin/products', label: 'Products', permission: 'products.view', icon: 'products' },
    { href: '/admin/inventory', label: 'Inventory', permission: 'inventory.view', icon: 'inventory' },
    { href: '/admin/purchase-orders', label: 'Purchase orders', permission: 'purchaseOrders.view', icon: 'purchaseOrders' },
    { href: '/admin/inventory/transfers', label: 'Transfers', permission: 'transfers.view', icon: 'transfers' },
    { href: '/admin/operations', label: 'Operations', permission: 'inventory.view', icon: 'operations' },
  ]},
  { id: 'collections', label: 'Collections', items: [
    { href: '/admin/collections', label: 'Collections', permission: 'collections.view', icon: 'collections' },
  ]},
  { id: 'customers', label: 'Customers', items: [
    { href: '/admin/customers', label: 'Customers', permission: 'customers.view', icon: 'customers' },
    { href: '/admin/customer-segments', label: 'Segments', permission: 'customerSegments.view', icon: 'segments' },
    { href: '/admin/gift-cards', label: 'Gift cards', permission: 'giftCards.view', icon: 'giftCards' },
  ]},
  { id: 'content', label: 'Content', items: [
    { href: '/admin/media', label: 'Files', permission: 'media.view', icon: 'files' },
    { href: '/admin/reviews', label: 'Reviews', permission: 'reviews.view', icon: 'reviews' },
  ]},
  { id: 'online-store', label: 'Online Store', items: [
    { href: '/admin/online-store', label: 'Overview', permission: 'content.view', icon: 'store' },
    { href: '/admin/online-store/theme-editor', label: 'Theme editor', permission: 'content.view', icon: 'theme' },
    { href: '/admin/online-store/navigation', label: 'Navigation', permission: 'content.view', icon: 'navigation' },
    { href: '/admin/online-store/policies', label: 'Policies', permission: 'content.view', icon: 'content' },
  ]},
  { id: 'marketing', label: 'Marketing', items: [
    { href: '/admin/coupons', label: 'Discounts', permission: 'coupons.view', icon: 'discounts' },
    { href: '/admin/bundles', label: 'Bundles', permission: 'products.view', icon: 'bundles' },
    { href: '/admin/newsletter', label: 'Email subscribers', permission: 'customers.view', icon: 'newsletter' },
    { href: '/admin/push-campaigns', label: 'Push campaigns', permission: 'customers.manage', icon: 'pushCampaigns' },
  ]},
  { id: 'analytics', label: 'Analytics', items: [
    { href: '/admin/reports', label: 'Analytics & reports', permission: 'reports.view', icon: 'analytics' },
    { href: '/admin/live-visitors', label: 'Live visitors', permission: 'reports.view', icon: 'liveVisitors' },
    { href: '/admin/data-transfer', label: 'Data management', permission: 'reports.view', icon: 'dataTransfer' },
  ]},
  { id: 'settings', label: 'Settings', items: [
    { href: '/admin/shipping', label: 'Shipping', permission: 'shipping.view', icon: 'shipping' },
    { href: '/admin/tax', label: 'Tax', permission: 'tax.view', icon: 'tax' },
    { href: '/admin/system', label: 'System health', permission: 'settings.view', icon: 'system' },
    { href: '/admin/users', label: 'Users & roles', permission: 'users.view', icon: 'users' },
    { href: '/admin/activity', label: 'Activity log', permission: 'activity.view', icon: 'activity' },
    { href: '/admin/settings', label: 'Settings', permission: 'settings.view', icon: 'settings' },
  ]},
]

/*
 * Design tokens and shared page-content rules (cards, buttons, tables, the shell's
 * own min-height/flex box) live in ./admin-overhaul.css. The nav itself - top bar,
 * dropdowns, mobile drawer, search - lives entirely in components/admin-nav.tsx and
 * its CSS module, not here. Keep only page-specific rules in this string.
 */
const adminCss = `
body:has(.adminShell) > .nav, body:has(.adminShell) .nav { display:none !important; }
body:has(.adminShell) .catalogStats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:0 0 16px; }
body:has(.adminShell) .statCard { appearance:none; width:100%; padding:16px 18px; border:1px solid var(--admin-border); border-radius:14px; background:var(--admin-surface); text-align:left; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,.03); transition:border .15s ease,box-shadow .15s ease,transform .15s ease; }
body:has(.adminShell) .statCard:hover { border-color:#cfcfc8; box-shadow:0 5px 18px rgba(0,0,0,.05); transform:translateY(-1px); }
body:has(.adminShell) .statCard.active { border-color:var(--admin-ink); box-shadow:0 0 0 1px var(--admin-ink) inset; }
body:has(.adminShell) .statCard span { display:block; font-size:12px; }
body:has(.adminShell) .statCard strong { display:block; margin-top:6px; font-size:25px; line-height:1; letter-spacing:-.03em; }
body:has(.adminShell) .catalogToolbar { display:grid; grid-template-columns:minmax(320px,1.4fr) auto minmax(300px,.9fr); gap:10px; align-items:center; padding:12px; margin-bottom:14px; border-radius:15px; overflow:visible; box-shadow:0 1px 2px rgba(0,0,0,.02); }
body:has(.adminShell) .productSearch { max-width:none; height:44px; border-radius:10px; }
body:has(.adminShell) .catalogFilters { display:grid; grid-template-columns:1fr 1fr auto; gap:10px; align-items:center; }
body:has(.adminShell) .catalogFilters .input { min-width:0; }
body:has(.adminShell) .catalogToolbar .btn { min-height:44px; }
body:has(.adminShell) .productTableCard { border-radius:15px; box-shadow:0 1px 2px rgba(0,0,0,.03); }
body:has(.adminShell) .tableTopline { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid var(--admin-border-soft); }
body:has(.adminShell) .tableTopline .input.compact { height:34px; min-width:74px; }
body:has(.adminShell) .productTable { min-width:980px; }
body:has(.adminShell) .productTable th { background:#fbfbf9; padding:12px 14px; font-size:11px; text-transform:uppercase; letter-spacing:.06em; border-bottom:1px solid #e8e8e3; }
body:has(.adminShell) .productTable td { padding:13px 14px; height:68px; vertical-align:middle; }
body:has(.adminShell) .productTable tbody tr:hover { background:#fcfcfa; }
body:has(.adminShell) .productTable tbody tr.selectedRow { background:#f3f3ef; }
body:has(.adminShell) .productListName { min-width:280px; }
body:has(.adminShell) .statusPill { padding:6px 9px; border:1px solid transparent; }
body:has(.adminShell) .table .iconBtn { width:34px; height:34px; border-radius:9px; }
body:has(.adminShell) .catalogPagination { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-top:1px solid var(--admin-border-soft); }
body:has(.adminShell) .alert { margin-bottom:12px; }
body:has(.adminShell) .btn { box-shadow:0 1px 1px rgba(0,0,0,.04); transition:transform .15s ease,box-shadow .15s ease; }
body:has(.adminShell) .btn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 5px 14px rgba(0,0,0,.08); }
body:has(.adminShell) .btn:disabled { opacity:.55; cursor:not-allowed; }
body:has(.adminShell) .input:focus, body:has(.adminShell) .textarea:focus { outline:none; border-color:#8e8e87; box-shadow:0 0 0 3px rgba(23,23,23,.06); }
.opsTabs{display:flex;gap:4px;overflow:auto;padding:4px;margin-bottom:16px;border:1px solid var(--admin-border);background:var(--admin-surface);border-radius:12px}.opsTabs button{border:0;background:transparent;padding:10px 14px;border-radius:8px;font:inherit;font-weight:600;color:#6a6a64;white-space:nowrap;cursor:pointer}.opsTabs button.active{background:var(--admin-ink);color:var(--admin-surface)}
/* Still consumed by components/shipping-admin-pro.tsx's zone-rate editor (not yet migrated onto a CSS Module) - do not remove until that page is componentized too. */
.opsPanel{padding:20px}.opsList{display:grid;gap:8px;margin-top:16px}.opsRow{display:grid;grid-template-columns:minmax(0,1.5fr) auto minmax(100px,.8fr);align-items:center;gap:12px;padding:11px 12px;background:#fafaf8;border:1px solid #ecece7;border-radius:10px;font-size:13px}
@media(max-width:1100px){body:has(.adminShell) .catalogToolbar{grid-template-columns:1fr}}
@media(max-width:760px){.catalogStats{grid-template-columns:repeat(2,1fr) !important}.catalogToolbar{grid-template-columns:1fr !important}.catalogFilters{grid-template-columns:1fr !important}.productTableCard{overflow:auto}.productTable{min-width:860px}}
`

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/admin/login')
  const visibleGroups = groups.map(group => ({ ...group, items: group.items.filter(item => hasPermission(user, item.permission as Permission)) })).filter(group => group.items.length)
  // The admin's accent follows the store's published Primary colour (see lib/admin-accent.ts).
  // If the theme can't be read, the admin keeps its default accent.
  const theme = await getThemeState().then(state => state.theme).catch(() => null)
  const brandCss = theme ? adminBrandCss(theme.colors) : ''
  const brand = { name: theme?.brandName || 'Control Center', logoUrl: theme?.logoUrl || undefined, logoDarkUrl: theme?.logoUrlDark || undefined, iconUrl: theme?.faviconUrl || undefined }
  // Badge on Orders in the sidebar and phone tab bar: orders still waiting to ship.
  const ordersToFulfill = hasPermission(user, 'orders.view')
    ? await db.order.count({ where: { status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING] } } }).catch(() => 0)
    : 0
  const roleLabel = user.staffRoleId ? (await getStaffRoles().catch(() => [])).find(r => r.id === user.staffRoleId)?.name || 'Staff' : builtInRoleName(user.role)

  return <>
    <style dangerouslySetInnerHTML={{__html:adminCss}} />
    {brandCss && <style dangerouslySetInnerHTML={{__html:brandCss}} />}
    <div className="adminShell">
      <ToastProvider>
        <ConfirmProvider>
          <AdminNav groups={visibleGroups} brand={brand} ordersToFulfill={ordersToFulfill} name={user.name} email={user.email} role={roleLabel} vapidPublicKey={process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}>
            {children}
          </AdminNav>
        </ConfirmProvider>
      </ToastProvider>
    </div>
  </>
}
