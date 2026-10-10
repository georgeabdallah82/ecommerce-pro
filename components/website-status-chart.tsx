'use client'

import { useState } from 'react'
import { formatCount } from '@/lib/website-status-shared'
import styles from './admin-website-status.module.css'

type Day = { date: string; requests: number; errors: number }

function weekday(date: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}

function niceMax(value: number) {
  if (value <= 0) return 10
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return [1, 2, 2.5, 5, 10].map(s => s * magnitude).find(s => s >= value) || value
}

// Requests to the website per day (UTC) for the last 7 days: one series, so no legend. Hover or
// tap a column for its numbers; "Show numbers" has them all as a table.
export default function WebsiteStatusChart({ days }: { days: Day[] }) {
  const [active, setActive] = useState<number | null>(null)
  const max = niceMax(Math.max(0, ...days.map(d => d.requests)))
  return <div className={styles.chart}>
    <div className={styles.chartArea}>
      <div className={styles.yAxis} aria-hidden="true"><span style={{ top: 0 }}>{formatCount(max)}</span><span style={{ top: '100%' }}>0</span></div>
      <div className={styles.plot} role="img" aria-label={`Website requests per day for the last 7 days, from ${formatCount(days[0]?.requests || 0)} to ${formatCount(days[days.length - 1]?.requests || 0)}`}>
        <div className={styles.gridline} />
        {days.map((day, i) => (
          <button
            type="button"
            key={day.date}
            className={`${styles.col} ${active === i ? styles.colActive : ''}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            onClick={() => setActive(active === i ? null : i)}
            aria-label={`${day.date}: ${day.requests} requests, ${day.errors} errors`}
          >
            <span className={styles.bar} style={{ height: `${Math.max(0, (day.requests / max) * 100)}%` }} />
            {active === i && <span className={styles.tip}>{weekday(day.date)} {day.date.slice(5)}<br />{day.requests.toLocaleString('en-US')} requests<br />{day.errors.toLocaleString('en-US')} errors</span>}
          </button>
        ))}
      </div>
    </div>
    <div className={styles.xAxis} aria-hidden="true"><span>0</span>{days.map(d => <span key={d.date}>{weekday(d.date)}</span>)}</div>
    <details className={styles.numbers}>
      <summary>Show numbers</summary>
      <table>
        <thead><tr><th>Day (UTC)</th><th>Requests</th><th>Errors</th></tr></thead>
        <tbody>{days.map(d => <tr key={d.date}><td>{d.date}</td><td>{d.requests.toLocaleString('en-US')}</td><td>{d.errors.toLocaleString('en-US')}</td></tr>)}</tbody>
      </table>
    </details>
  </div>
}
