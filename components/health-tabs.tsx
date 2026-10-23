import Link from '@/components/admin-link'
import styles from './health-tabs.module.css'

// The three "is everything OK?" pages share one menu entry (Health); these tabs switch between them.
// Launch checklist and Website status are owner pages (settings.manage), so staff who can only view
// System health see no tabs at all.
const TABS = [
  { id: 'system', href: '/admin/system', label: 'System health' },
  { id: 'launch', href: '/admin/launch', label: 'Launch checklist' },
  { id: 'status', href: '/admin/website-status', label: 'Website status' },
] as const

export default function HealthTabs({ current, canManage }: { current: (typeof TABS)[number]['id']; canManage: boolean }) {
  if (!canManage) return null
  return <nav className={styles.tabs} aria-label="Health pages">
    {TABS.map(tab => <Link key={tab.id} href={tab.href} className={`${styles.tab}${tab.id === current ? ` ${styles.active}` : ''}`} aria-current={tab.id === current ? 'page' : undefined}>{tab.label}</Link>)}
  </nav>
}
