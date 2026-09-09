'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, RefreshCw, TrendingDown, TrendingUp, Package, Users, ShoppingBag, DollarSign } from 'lucide-react'
import { money } from '@/lib/config'
import styles from './admin-analytics.module.css'

type Analytics = {
  periodDays: number
  compareDays: number
  granularity: 'day' | 'month'
  kpis: any
  series: { date: string; revenue: number; orders: number }[]
  topProducts: any[]
  lowStock: any[]
}

const ranges = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '12 months', days: 365 },
]

export default function AnalyticsAdmin() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/analytics?days=${days}&compare=${days}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to load analytics')
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [days])

  const maxRevenue = useMemo(() => Math.max(1, ...(data?.series || []).map(x => x.revenue)), [data])
  const chartLabel = (date: string) =>
    data?.granularity === 'month' ? date.slice(0, 7) : days <= 7 ? date.slice(5) : days <= 30 ? date.slice(5) : ''

  return (
    <div className={styles.page}>
      <div className="sectionHead catalogHead">
        <div>
          <span className="muted">ANALYTICS</span>
          <h1 className="h2">Analytics</h1>
          <p className="muted">Understand sales, customers and inventory at a glance.</p>
        </div>
        <div className="inline">
          <div className={styles.rangeBar}>
            {ranges.map(r => (
              <button
                key={r.days}
                className={`${styles.rangeBtn}${days === r.days ? ` ${styles.rangeBtnActive}` : ''}`}
                onClick={() => setDays(r.days)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button className="btn secondary" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="alert danger">{error}</div>}

      {loading && !data ? (
        <div className={styles.loading}>
          <div className={`card ${styles.skeleton}`} />
          <div className={`card ${styles.skeleton}`} />
          <div className={`card ${styles.skeleton}`} />
        </div>
      ) : data && (
        <>
          <div className={styles.kpis}>
            <Metric icon={<DollarSign size={18} />} label="Net sales" value={money(data.kpis.revenue)} change={data.kpis.revenueChange} />
            <Metric icon={<ShoppingBag size={18} />} label="Orders" value={data.kpis.orders} />
            <Metric icon={<BarChart3 size={18} />} label="Average order" value={money(data.kpis.averageOrderValue)} />
            <Metric icon={<Package size={18} />} label="Items sold" value={data.kpis.itemsSold} />
            <Metric icon={<Users size={18} />} label="New customers" value={data.kpis.newCustomers} />
          </div>

          <div className={styles.grid}>
            <section className={`card ${styles.analyticsCard}`}>
              <div className={styles.cardHead}>
                <div>
                  <h3>Sales overview</h3>
                  <p className="muted">{data.granularity === 'month' ? 'Net revenue by month' : 'Net revenue by day'}</p>
                </div>
                <span className="pill">Last {days === 365 ? '12 months' : `${days} days`}</span>
              </div>
              <div className={styles.chart}>
                <div className={styles.chartBars}>
                  {data.series.map(x => (
                    <div className={styles.barCol} key={x.date} title={`${x.date}: ${money(x.revenue)} · ${x.orders} orders`}>
                      <div className={styles.bar} style={{ height: `${Math.max(3, Math.round((x.revenue / maxRevenue) * 100))}%` }} />
                      <span>{chartLabel(x.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className={`card ${styles.analyticsCard}`}>
              <div className={styles.cardHead}>
                <div>
                  <h3>Top products</h3>
                  <p className="muted">Best performers by sales</p>
                </div>
              </div>
              <div className={styles.rankList}>
                {!data.topProducts.length ? (
                  <div className="emptyInline">No sales in this period.</div>
                ) : data.topProducts.map((p, i) => (
                  <div className={styles.rankRow} key={p.productId}>
                    <span className={styles.rank}>{i + 1}</span>
                    <div className={styles.rankInfo}>
                      <strong>{p.name}</strong>
                      <span className="muted">{p.quantity} units</span>
                    </div>
                    <strong>{money(p.sales)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className={`${styles.grid} ${styles.gridBottom}`}>
            <section className={`card ${styles.analyticsCard}`}>
              <div className={styles.cardHead}>
                <div>
                  <h3>Inventory watch</h3>
                  <p className="muted">Products that need attention</p>
                </div>
                <a className="textLink" href="/admin/inventory">View inventory</a>
              </div>
              {!data.lowStock.length ? (
                <div className="emptyInline">Inventory looks healthy.</div>
              ) : (
                <div className={styles.rankList}>
                  {data.lowStock.map(x => (
                    <div className={styles.rankRow} key={x.id}>
                      <div className={styles.rankInfo}>
                        <strong>{x.product}</strong>
                        <span className="muted">{x.sku}{x.variant ? ` · ${x.variant}` : ''}</span>
                      </div>
                      <span className={x.available <= 0 ? 'statusPill danger' : 'statusPill warning'}>{x.available} available</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={`card ${styles.analyticsCard}`}>
              <div className={styles.cardHead}>
                <div>
                  <h3>Quick insights</h3>
                  <p className="muted">Useful operational signals</p>
                </div>
              </div>
              <div className={styles.insightList}>
                <div>
                  <strong>{data.kpis.revenueChange >= 0 ? 'Sales are trending up' : 'Sales are trending down'}</strong>
                  <span className="muted">{Math.abs(data.kpis.revenueChange)}% vs previous period</span>
                </div>
                <div>
                  <strong>{data.kpis.orders ? Math.round((data.kpis.itemsSold / data.kpis.orders) * 10) / 10 : 0} items</strong>
                  <span className="muted">Average items per order</span>
                </div>
                <div>
                  <strong>{data.lowStock.length}</strong>
                  <span className="muted">Low-stock items to review</span>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function Metric({ icon, label, value, change }: { icon: React.ReactNode; label: string; value: React.ReactNode; change?: number }) {
  return (
    <div className={`card ${styles.metricCard}`}>
      <div className={styles.metricIcon}>{icon}</div>
      <span className="muted">{label}</span>
      <strong>{value}</strong>
      {typeof change === 'number' && (
        <small className={change >= 0 ? styles.metricUp : styles.metricDown}>
          {change >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {Math.abs(change)}% vs previous
        </small>
      )}
    </div>
  )
}
