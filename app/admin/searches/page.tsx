import { requirePermission } from '@/lib/auth'
import { searchReport } from '@/lib/search-analytics'
import ui from '@/components/admin-ui.module.css'

// Admin > Analytics > Searches: what shoppers searched for in the last 30 days, and the searches
// that found nothing (a product to add, a spelling to add to the store's word list, or a link to fix).
export default async function Searches() {
  await requirePermission('reports.view')
  const report = await searchReport()
  return <div>
    <div className={ui.sectionHead}>
      <div>
        <span className={ui.muted}>OPERATIONS & INSIGHTS</span>
        <h1 className={ui.title}>Searches</h1>
        <p className={ui.muted}>What shoppers typed into the shop search over the last {report.days} days.</p>
      </div>
    </div>

    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 18 }}>
      <div className={ui.card} style={{ padding: 16 }}><span className={ui.muted}>Searches</span><strong style={{ display: 'block', fontSize: 28 }}>{report.total}</strong></div>
      <div className={ui.card} style={{ padding: 16 }}><span className={ui.muted}>Found nothing</span><strong style={{ display: 'block', fontSize: 28 }}>{report.noResults}</strong><span className={ui.muted}>{report.total ? `${Math.round((report.noResults / report.total) * 100)}% of searches` : 'No searches yet'}</span></div>
    </div>

    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
      <section className={ui.card} style={{ padding: 16 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Most searched</h2>
        {report.top.length ? <table className={ui.table}>
          <thead><tr><th>Search</th><th>Times</th><th>Avg. results</th></tr></thead>
          <tbody>{report.top.map(row => <tr key={row.query}><td>{row.query}</td><td>{row.searches}</td><td>{row.avgResults}</td></tr>)}</tbody>
        </table> : <p className={ui.muted}>Nobody has searched yet.</p>}
      </section>
      <section className={ui.card} style={{ padding: 16 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Found nothing</h2>
        <p className={ui.muted} style={{ margin: '0 0 10px', fontSize: 13 }}>Products you could add, or spellings to add to the store&apos;s word list.</p>
        {report.empty.length ? <table className={ui.table}>
          <thead><tr><th>Search</th><th>Times</th><th /></tr></thead>
          <tbody>{report.empty.map(row => <tr key={row.query}><td>{row.query}</td><td>{row.searches}</td><td><a href={`/admin/settings?addWord=${encodeURIComponent(row.query)}`}>Add a search word</a></td></tr>)}</tbody>
        </table> : <p className={ui.muted}>Every search found something.</p>}
      </section>
    </div>
  </div>
}
