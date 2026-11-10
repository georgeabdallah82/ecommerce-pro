import Link from '@/components/admin-link'
import { requirePermission } from '@/lib/auth'
import { SEARCH_REPORT_PERIODS, searchReport } from '@/lib/search-analytics'
import SearchReportTables from '@/components/search-report-tables'
import ui from '@/components/admin-ui.module.css'
import styles from '@/components/admin-searches.module.css'

// Admin > Analytics > Searches: what shoppers searched for, and the searches that found nothing
// (a product to add, a spelling to add to the store's word list, or a link to fix).
export default async function Searches({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requirePermission('reports.view')
  const requested = Number((await searchParams).days)
  const report = await searchReport(new Date(), requested)
  const missRate = report.total ? Math.round((report.noResults / report.total) * 100) : 0
  const hitRate = report.total ? 100 - missRate : 0

  return <div className={styles.page}>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>OPERATIONS &amp; INSIGHTS</span>
        <h1 className={ui.title}>Searches</h1>
        <p className={ui.muted}>What shoppers typed into the shop search in the last {report.days} days.</p>
      </div>
      <nav className={styles.periods} aria-label="Period">
        {SEARCH_REPORT_PERIODS.map(days => (
          <Link key={days} href={`/admin/searches?days=${days}`} aria-current={report.days === days ? 'page' : undefined} className={report.days === days ? styles.periodOn : undefined}>
            {days === 7 ? 'Last 7 days' : days === 30 ? 'Last 30 days' : 'Last 90 days'}
          </Link>
        ))}
      </nav>
    </div>

    <div className={styles.stats}>
      <div className={styles.stat}><span>Searches</span><strong>{report.total.toLocaleString()}</strong></div>
      <div className={styles.stat}><span>Found something</span><strong>{report.found.toLocaleString()}</strong><small>{report.total ? `${hitRate}% of searches` : 'No searches yet'}</small></div>
      <div className={`${styles.stat} ${report.noResults ? styles.statWarn : ''}`}><span>Found nothing</span><strong>{report.noResults.toLocaleString()}</strong><small>{report.total ? `${missRate}% of searches` : 'No searches yet'}</small></div>
    </div>

    {report.total === 0
      ? <div className={`${ui.card} ${styles.empty}`}>
          <h2>No searches in this period</h2>
          <p className={ui.muted}>When shoppers search the shop, their searches show up here, with the ones that found nothing.</p>
        </div>
      : <SearchReportTables top={report.top} empty={report.empty} />}
  </div>
}
