import { Suspense } from 'react'
import { RefreshCw } from 'lucide-react'
import { requirePermission } from '@/lib/auth'
import { DEFAULT_STORE_TIMEZONE } from '@/lib/admin-datetime'
import { getStoreTimezone } from '@/lib/store-timezone'
import { BackupCard, CARDS, CardSkeleton, CloudflareCard, DatabaseCard, EmailCard, GithubCard, StatusSummary, UptimeCard } from '@/components/website-status'
import styles from '@/components/admin-website-status.module.css'
import ui from '@/components/admin-ui.module.css'

// The owner's view of everything the website runs on: database, backups, hosting, emails,
// uptime and the automatic jobs (lib/website-status.ts). Owner only (settings.manage): it shows
// infrastructure details staff don't need. Every card streams in on its own.
export default async function WebsiteStatusPage() {
  await requirePermission('settings.manage')
  const timezone = await getStoreTimezone().catch(() => DEFAULT_STORE_TIMEZONE)
  return <div className={styles.page}>
    <div className={ui.sectionHead}>
      <div><span className={ui.muted}>OWNER</span><h1 className={ui.title}>Website status</h1><p className={ui.muted}>Your database, hosting, emails, uptime and automatic jobs in one place.</p></div>
      <a className={`${ui.btn} ${ui.btnSecondary}`} href="/admin/website-status"><RefreshCw size={15} aria-hidden="true" /> Refresh</a>
    </div>
    <Suspense fallback={<div className={`${ui.card} ${styles.summary}`}><div className={styles.skeleton} aria-label="Loading"><span /><span /></div></div>}>
      <StatusSummary timezone={timezone} />
    </Suspense>
    <div className={styles.grid}>
      <Suspense fallback={<CardSkeleton {...CARDS.database} />}><DatabaseCard timezone={timezone} /></Suspense>
      <Suspense fallback={<CardSkeleton {...CARDS.backups} />}><BackupCard timezone={timezone} /></Suspense>
      <Suspense fallback={<CardSkeleton {...CARDS.uptime} />}><UptimeCard timezone={timezone} /></Suspense>
      <Suspense fallback={<CardSkeleton {...CARDS.cloudflare} />}><CloudflareCard timezone={timezone} /></Suspense>
      <Suspense fallback={<CardSkeleton {...CARDS.email} />}><EmailCard timezone={timezone} /></Suspense>
      <Suspense fallback={<CardSkeleton {...CARDS.github} />}><GithubCard timezone={timezone} /></Suspense>
    </div>
  </div>
}
