'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, ExternalLink, Home, Search } from 'lucide-react'
import AdminThemeToggle from '@/components/admin-theme-toggle'

const labels: Array<[string, string]> = [
  ['/admin', 'Dashboard'], ['/admin/orders', 'Orders'], ['/admin/products', 'Products'], ['/admin/inventory', 'Inventory'], ['/admin/operations', 'Operations'],
  ['/admin/collections', 'Collections'], ['/admin/categories', 'Categories'], ['/admin/customers', 'Customers'], ['/admin/content', 'Content'], ['/admin/media', 'Files'],
  ['/admin/reviews', 'Reviews'], ['/admin/online-store', 'Online Store'], ['/admin/coupons', 'Discounts'], ['/admin/reports', 'Analytics & reports'],
  ['/admin/shipping', 'Shipping'], ['/admin/system', 'System health'], ['/admin/users', 'Users & roles'], ['/admin/activity', 'Activity log'], ['/admin/settings', 'Settings'],
]

function currentLabel(pathname: string) {
  const exact = labels.find(([path]) => pathname === path)
  if (exact) return exact[1]
  const parent = labels.filter(([path]) => path !== '/admin' && pathname.startsWith(`${path}/`)).sort((a, b) => b[0].length - a[0].length)[0]
  return parent?.[1] || 'Control Center'
}

export default function AdminTopbar({ name, email }: { name: string | null; email: string }) {
  const pathname = usePathname()
  const title = currentLabel(pathname)

  return (
    <header className="adminWorkspaceTopbar">
      <div className="adminWorkspaceTitle">
        <div className="adminBreadcrumbs"><Link href="/admin" className="adminBreadcrumbHome" aria-label="Dashboard"><Home size={13} /></Link><ChevronRight size={13} aria-hidden="true" /><span>Control Center</span><ChevronRight size={13} aria-hidden="true" /><strong>{title}</strong></div>
        <h1>{title}</h1>
      </div>
      <div className="adminWorkspaceActions">
        <button type="button" className="adminTopSearch" onClick={() => document.getElementById('admin-nav-search')?.focus()} title="Search admin navigation"><Search size={15} /><span>Search</span><kbd>Ctrl K</kbd></button>
        <Link href="/" className="adminTopIconLink" title="Open storefront" aria-label="Open storefront"><ExternalLink size={16} /></Link>
        <div className="adminTopTheme"><AdminThemeToggle /></div>
        <div className="adminTopAccount"><div className="adminTopAvatar">{(name || email || 'A').slice(0, 1).toUpperCase()}</div><div><strong>{name || 'Administrator'}</strong><span>{email}</span></div></div>
      </div>
      <style jsx>{`
        .adminWorkspaceTopbar{min-height:80px;display:flex;align-items:center;justify-content:space-between;gap:22px;padding:14px 0;margin-bottom:28px;border-bottom:1px solid #e3e3dd;background:rgba(246,246,244,.92);backdrop-filter:blur(18px);position:sticky;top:0;z-index:60}
        .adminWorkspaceTitle{min-width:0}.adminBreadcrumbs{display:flex;align-items:center;gap:5px;color:#85857e;font-size:11px;font-weight:700}.adminBreadcrumbHome{display:grid;place-items:center;color:#777770}.adminBreadcrumbs strong{color:#3b3b37}.adminWorkspaceTitle h1{margin:5px 0 0;font-size:27px;line-height:1;letter-spacing:-.035em;color:#191a18}
        .adminWorkspaceActions{display:flex;align-items:center;gap:8px;min-width:0}.adminTopSearch{height:38px;display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid #deded8;border-radius:10px;background:#fff;color:#686862;font-size:12px;font-weight:750;cursor:pointer}.adminTopSearch:hover{background:#f5f5f1;color:#20201d}.adminTopSearch kbd{padding:3px 5px;border:1px solid #e0e0da;border-radius:6px;background:#f8f8f5;color:#85857e;font:700 9px/1 ui-monospace,monospace}.adminTopIconLink{display:grid;place-items:center;width:38px;height:38px;border:1px solid #deded8;border-radius:10px;background:#fff;color:#5d5d57;transition:.16s ease}.adminTopIconLink:hover{background:#f5f5f1;color:#171717}.adminTopTheme{width:38px;height:38px}.adminTopTheme .adminThemeToggle{width:38px!important;height:38px!important;justify-content:center!important;padding:0!important}.adminTopTheme .adminThemeToggle span{display:none!important}
        .adminTopAccount{display:flex;align-items:center;gap:9px;padding-left:3px}.adminTopAvatar{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#171817;color:#fff;font-size:12px;font-weight:900}.adminTopAccount div:last-child{display:grid;gap:2px;min-width:0}.adminTopAccount strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;font-size:11px}.adminTopAccount span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px;color:#878780;font-size:10px}
        @media(max-width:900px){.adminWorkspaceTitle h1{font-size:23px}.adminTopSearch{width:38px;justify-content:center;padding:0}.adminTopSearch span,.adminTopSearch kbd{display:none}.adminTopAccount div:last-child{display:none}.adminWorkspaceActions{gap:6px}}
        @media(max-width:560px){.adminWorkspaceTopbar{min-height:66px;margin-bottom:18px;gap:10px}.adminBreadcrumbs{display:none}.adminWorkspaceTitle h1{font-size:20px}.adminTopIconLink{display:none}.adminTopAvatar{width:32px;height:32px}}
        html[data-admin-theme='dark'] .adminWorkspaceTopbar{background:rgba(16,18,17,.9)!important;border-color:#2a2f2c!important}.adminThemeToggle{box-sizing:border-box}
      `}</style>
    </header>
  )
}