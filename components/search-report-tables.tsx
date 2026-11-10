'use client'

import { useMemo, useState } from 'react'
import Link from '@/components/admin-link'
import { Search, X } from 'lucide-react'
import styles from './admin-searches.module.css'

type Row = { query: string; searches: number }
type TopRow = Row & { avgResults: number }

// The two tables of the Searches report, each with a filter box and bars that show how the
// searches compare with the most common one.
export default function SearchReportTables({ top, empty }: { top: TopRow[]; empty: Row[] }) {
  const [topQuery, setTopQuery] = useState('')
  const [emptyQuery, setEmptyQuery] = useState('')
  const topMax = Math.max(1, ...top.map(r => r.searches))
  const emptyMax = Math.max(1, ...empty.map(r => r.searches))
  const topRows = useMemo(() => top.filter(r => r.query.includes(topQuery.trim().toLowerCase())), [top, topQuery])
  const emptyRows = useMemo(() => empty.filter(r => r.query.includes(emptyQuery.trim().toLowerCase())), [empty, emptyQuery])

  return <div className={styles.tables}>
    <section className={styles.panel} aria-labelledby="most-searched">
      <div className={styles.panelHead}>
        <div><h2 id="most-searched">Most searched</h2><p>The words and phrases shoppers use most.</p></div>
        {top.length > 0 && <Filter value={topQuery} onChange={setTopQuery} label="Filter most searched" />}
      </div>
      {top.length === 0
        ? <p className={styles.none}>Nobody has searched yet.</p>
        : topRows.length === 0
          ? <p className={styles.none}>No searches match &ldquo;{topQuery}&rdquo;.</p>
          : <div className={styles.tableWrap}><table className={styles.table}>
              <thead><tr><th>Search</th><th className={styles.num}>Times</th><th className={styles.num}>Avg. results</th></tr></thead>
              <tbody>{topRows.map(row => (
                <tr key={row.query}>
                  <td><span className={styles.query}>{row.query}</span><span className={styles.bar} style={{ width: `${Math.max(4, (row.searches / topMax) * 100)}%` }} aria-hidden="true" /></td>
                  <td className={styles.num}>{row.searches}</td>
                  <td className={styles.num}>{row.avgResults}</td>
                </tr>
              ))}</tbody>
            </table></div>}
    </section>

    <section className={styles.panel} aria-labelledby="found-nothing">
      <div className={styles.panelHead}>
        <div><h2 id="found-nothing">Found nothing</h2><p>Add a product, or add the spelling to the store&apos;s search words.</p></div>
        {empty.length > 0 && <Filter value={emptyQuery} onChange={setEmptyQuery} label="Filter searches that found nothing" />}
      </div>
      {empty.length === 0
        ? <p className={styles.none}>Every search found something.</p>
        : emptyRows.length === 0
          ? <p className={styles.none}>No searches match &ldquo;{emptyQuery}&rdquo;.</p>
          : <div className={styles.tableWrap}><table className={styles.table}>
              <thead><tr><th>Search</th><th className={styles.num}>Times</th><th><span className={styles.srOnly}>Actions</span></th></tr></thead>
              <tbody>{emptyRows.map(row => (
                <tr key={row.query}>
                  <td><span className={styles.query}>{row.query}</span><span className={`${styles.bar} ${styles.barWarn}`} style={{ width: `${Math.max(4, (row.searches / emptyMax) * 100)}%` }} aria-hidden="true" /></td>
                  <td className={styles.num}>{row.searches}</td>
                  <td className={styles.actions}>
                    <Link href={`/admin/settings?addWord=${encodeURIComponent(row.query)}`} className={styles.actionLink}>Add search word</Link>
                    <Link href="/admin/products/new" className={styles.actionLink}>New product</Link>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>}
    </section>
  </div>
}

function Filter({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <label className={styles.filter}>
    <Search size={14} aria-hidden="true" />
    <input value={value} onChange={e => onChange(e.target.value)} placeholder="Filter…" aria-label={label} />
    {value && <button type="button" onClick={() => onChange('')} aria-label="Clear filter"><X size={13} /></button>}
  </label>
}
