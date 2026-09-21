'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Calendar, Check, Download, Package, RefreshCw, TrendingDown, TrendingUp, Users, ShoppingBag, DollarSign, Repeat, Tag, Percent } from 'lucide-react'
import { money } from '@/lib/config'
import styles from './admin-analytics.module.css'
import ui from './admin-ui.module.css'
import { LineChart, Sparkline } from './analytics-charts'

type Analytics = {
  periodDays: number
  granularity: 'day' | 'month'
  range: { since: string; until: string }
  compareRange: { since: string; until: string } | null
  kpis: any
  series: { date: string; revenue: number; orders: number; items: number; newCustomers: number }[]
  previousSeries: { date: string; revenue: number; orders: number; items: number; newCustomers: number }[] | null
  topProducts: any[]
  lowStock: any[]
}

type DiscountRow = { code: string; timesUsed: number; discountGiven: number; revenue: number; type: string | null; isAutomatic: boolean; isActive: boolean | null }

type Preset =
  | { id: string; label: string; kind: 'days'; days: number }
  | { id: string; label: string; kind: 'range' }
  | { id: string; label: string; kind: 'custom' }

const PRESETS: Preset[] = [
  { id: 'today', label: 'Today', kind: 'days', days: 1 },
  { id: '7', label: 'Last 7 days', kind: 'days', days: 7 },
  { id: '30', label: 'Last 30 days', kind: 'days', days: 30 },
  { id: '90', label: 'Last 90 days', kind: 'days', days: 90 },
  { id: '365', label: 'Last 12 months', kind: 'days', days: 365 },
  { id: 'this_month', label: 'This month', kind: 'range' },
  { id: 'last_month', label: 'Last month', kind: 'range' },
  { id: 'custom', label: 'Custom range', kind: 'custom' },
]

const COMPARE_OPTIONS = [
  { id: 'previous_period', label: 'Compare: previous period' },
  { id: 'previous_year', label: 'Compare: previous year' },
  { id: 'none', label: 'No comparison' },
]

function toISODate(d: Date) { return d.toISOString().slice(0, 10) }

function rangeForPreset(preset: Preset, customStart: string, customEnd: string): { days?: number; start?: string; end?: string } {
  const now = new Date()
  if (preset.kind === 'days') return { days: preset.days }
  if (preset.id === 'this_month') return { start: toISODate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), end: toISODate(now) }
  if (preset.id === 'last_month') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
    return { start: toISODate(start), end: toISODate(end) }
  }
  return { start: customStart || toISODate(new Date(now.getTime() - 30 * 86400000)), end: customEnd || toISODate(now) }
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = [headers, ...rows].map(row => row.map(escape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function api(path: string) {
  const r = await fetch(path, { cache: 'no-store' })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function AnalyticsAdmin() {
  const [tab, setTab] = useState<'overview' | 'discounts'>('overview')
  const [presetId, setPresetId] = useState('30')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [compareMode, setCompareMode] = useState('previous_period')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [discounts, setDiscounts] = useState<{ rows: DiscountRow[]; totals: any } | null>(null)
  const [discountsLoading, setDiscountsLoading] = useState(false)
  const [discountsError, setDiscountsError] = useState('')

  const [discountsReloadKey, setDiscountsReloadKey] = useState(0)
  const preset = PRESETS.find(p => p.id === presetId) || PRESETS[2]

  function rangeParams() {
    const { days, start, end } = rangeForPreset(preset, customStart, customEnd)
    const params = new URLSearchParams()
    if (days) params.set('days', String(days))
    if (start) params.set('start', start)
    if (end) params.set('end', end)
    return params
  }

  const load = async () => {
    setLoading(true); setError('')
    try {
      const params = rangeParams()
      params.set('compareMode', compareMode)
      setData(await api(`/api/admin/analytics?${params.toString()}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [presetId, customStart, customEnd, compareMode])

  useEffect(() => {
    if (tab !== 'discounts') return
    setDiscountsLoading(true); setDiscountsError('')
    api(`/api/admin/analytics/discounts?${rangeParams().toString()}`)
      .then(setDiscounts)
      .catch(e => setDiscountsError(e instanceof Error ? e.message : 'Unable to load discount performance'))
      .finally(() => setDiscountsLoading(false))
  }, [tab, presetId, customStart, customEnd, discountsReloadKey])

  const dateLabel = useMemo(() => {
    if (preset.kind !== 'custom' || !data) return preset.label
    return `${new Date(data.range.since).toLocaleDateString()} – ${new Date(new Date(data.range.until).getTime() - 86400000).toLocaleDateString()}`
  }, [preset, data])

  const compareLabel = compareMode === 'previous_year' ? 'previous year' : compareMode === 'none' ? '' : 'previous period'
  const money0 = (v: number) => money(v)
  const chartFormatDate = (d: string) => data?.granularity === 'month' ? new Date(`${d}-02`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) : new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  function exportSalesCsv() {
    if (!data) return
    downloadCsv('sales-over-time.csv', ['Date', 'Revenue', 'Orders', 'Items sold', 'New customers'], data.series.map(p => [p.date, (p.revenue / 100).toFixed(2), p.orders, p.items, p.newCustomers]))
  }
  function exportTopProductsCsv() {
    if (!data) return
    downloadCsv('top-products.csv', ['Product', 'Units sold', 'Sales'], data.topProducts.map(p => [p.name, p.quantity, (p.sales / 100).toFixed(2)]))
  }
  function exportDiscountsCsv() {
    if (!discounts) return
    downloadCsv('discount-performance.csv', ['Code', 'Type', 'Times used', 'Discount given', 'Revenue'], discounts.rows.map(r => [r.code, r.type || '', r.timesUsed, (r.discountGiven / 100).toFixed(2), (r.revenue / 100).toFixed(2)]))
  }

  return (
    <div className={styles.page}>
      <div className={`${ui.sectionHead} catalogHead`}>
        <div>
          <span className={ui.muted}>ANALYTICS</span>
          <h1 className={ui.title}>Analytics</h1>
          <p className={ui.muted}>Understand sales, customers and inventory at a glance.</p>
        </div>
        <div className={styles.controlsRow}>
          <div className={styles.dateControl}>
            <button className={styles.dateTrigger} onClick={() => setPickerOpen(o => !o)}>
              <Calendar size={14} /> {dateLabel}
            </button>
            {pickerOpen && <>
              <div className={styles.dateOverlay} onClick={() => setPickerOpen(false)} />
              <div className={styles.datePanel}>
                {PRESETS.map(p => (
                  <button
                    key={p.id}
                    className={`${styles.datePresetRow} ${presetId === p.id ? styles.datePresetRowActive : ''}`}
                    onClick={() => { setPresetId(p.id); if (p.kind !== 'custom') setPickerOpen(false) }}
                  >
                    {p.label} {presetId === p.id && <Check size={16} className={styles.datePresetCheck} />}
                  </button>
                ))}
                {presetId === 'custom' && (
                  <div className={styles.dateCustomFooter}>
                    <div className={styles.dateCustomRow}>
                      <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                      <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                    </div>
                    <button className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={() => setPickerOpen(false)}>Apply</button>
                  </div>
                )}
              </div>
            </>}
          </div>
          <select className={styles.compareSelect} value={compareMode} onChange={e => setCompareMode(e.target.value)}>
            {COMPARE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <button className={`${ui.btn} ${ui.btnSecondary}`} onClick={tab === 'overview' ? load : () => setDiscountsReloadKey(k => k + 1)} disabled={loading || discountsLoading}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'overview' ? styles.tabActive : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`${styles.tab} ${tab === 'discounts' ? styles.tabActive : ''}`} onClick={() => setTab('discounts')}>Discounts</button>
      </div>

      {tab === 'overview' && (error && <div className={`${ui.alert} ${ui.alertDanger}`}>{error}</div>)}

      {tab === 'overview' && (loading && !data ? (
        <div className={styles.loading}>
          <div className={`${ui.card} ${styles.skeleton}`} />
          <div className={`${ui.card} ${styles.skeleton}`} />
          <div className={`${ui.card} ${styles.skeleton}`} />
        </div>
      ) : data && (
        <>
          <div className={styles.kpis}>
            <Metric icon={<DollarSign size={18} />} label="Net sales" value={money0(data.kpis.revenue)} change={data.kpis.revenueChange} compareLabel={compareLabel} sparkline={data.series.map(x => x.revenue)} />
            <Metric icon={<ShoppingBag size={18} />} label="Orders" value={data.kpis.orders} change={data.kpis.ordersChange} compareLabel={compareLabel} sparkline={data.series.map(x => x.orders)} />
            <Metric icon={<BarChart3 size={18} />} label="Average order" value={money0(data.kpis.averageOrderValue)} change={data.kpis.averageOrderValueChange} compareLabel={compareLabel} />
            <Metric icon={<Package size={18} />} label="Items sold" value={data.kpis.itemsSold} change={data.kpis.itemsSoldChange} compareLabel={compareLabel} sparkline={data.series.map(x => x.items)} />
            <Metric icon={<DollarSign size={18} />} label="Gross profit" value={money0(data.kpis.grossProfit)} change={data.kpis.grossProfitChange} compareLabel={compareLabel} />
            <Metric icon={<Percent size={18} />} label="Gross margin" value={`${data.kpis.marginPercent}%`} change={data.kpis.marginPercentChange} compareLabel={compareLabel} />
            <Metric icon={<Users size={18} />} label="New customers" value={data.kpis.newCustomers} change={data.kpis.newCustomersChange} compareLabel={compareLabel} sparkline={data.series.map(x => x.newCustomers)} />
            <Metric icon={<Repeat size={18} />} label="Returning customers" value={`${data.kpis.returningCustomerRate}%`} change={data.kpis.returningCustomerRateChange} compareLabel={compareLabel} />
          </div>

          <div className={styles.grid}>
            <section className={`${ui.card} ${styles.analyticsCard}`}>
              <div className={styles.cardHead}>
                <div>
                  <h3>Sales over time</h3>
                  <p className={ui.muted}>{data.granularity === 'month' ? 'Net revenue by month' : 'Net revenue by day'}</p>
                </div>
                <button className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={exportSalesCsv}><Download size={14} /> Export</button>
              </div>
              <LineChart
                current={data.series.map(x => ({ date: x.date, value: x.revenue }))}
                previous={data.previousSeries ? data.previousSeries.map(x => ({ date: x.date, value: x.revenue })) : null}
                currentLabel="This period"
                previousLabel={compareMode === 'previous_year' ? 'Previous year' : 'Previous period'}
                formatValue={money0}
                formatDate={chartFormatDate}
              />
            </section>

            <section className={`${ui.card} ${styles.analyticsCard}`}>
              <div className={styles.cardHead}>
                <div>
                  <h3>Top products</h3>
                  <p className={ui.muted}>Best performers by sales</p>
                </div>
                <button className={ui.iconBtn} title="Export CSV" onClick={exportTopProductsCsv}><Download size={15} /></button>
              </div>
              <div className={styles.rankList}>
                {!data.topProducts.length ? (
                  <div className="emptyInline">No sales in this period.</div>
                ) : data.topProducts.map((p, i) => (
                  <div className={styles.rankRow} key={p.productId}>
                    <span className={styles.rank}>{i + 1}</span>
                    <div className={styles.rankInfo}>
                      <strong>{p.name}</strong>
                      <span className={ui.muted}>{p.quantity} units</span>
                    </div>
                    <strong>{money(p.sales)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className={`${styles.grid} ${styles.gridBottom}`}>
            <section className={`${ui.card} ${styles.analyticsCard}`}>
              <div className={styles.cardHead}>
                <div>
                  <h3>Inventory watch</h3>
                  <p className={ui.muted}>Products that need attention</p>
                </div>
                <a className={ui.textLink} href="/admin/inventory">View inventory</a>
              </div>
              {!data.lowStock.length ? (
                <div className="emptyInline">Inventory looks healthy.</div>
              ) : (
                <div className={styles.rankList}>
                  {data.lowStock.map(x => (
                    <div className={styles.rankRow} key={x.id}>
                      <div className={styles.rankInfo}>
                        <strong>{x.product}</strong>
                        <span className={ui.muted}>{x.sku}{x.variant ? ` · ${x.variant}` : ''}</span>
                      </div>
                      <span className={`${ui.statusPill} ${x.available <= 0 ? ui.statusPillDanger : ui.statusPillWarning}`}>{x.available} available</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={`${ui.card} ${styles.analyticsCard}`}>
              <div className={styles.cardHead}>
                <div>
                  <h3>Quick insights</h3>
                  <p className={ui.muted}>Useful operational signals</p>
                </div>
              </div>
              <div className={styles.insightList}>
                {typeof data.kpis.revenueChange === 'number' && (
                  <div>
                    <strong>{data.kpis.revenueChange >= 0 ? 'Sales are trending up' : 'Sales are trending down'}</strong>
                    <span className={ui.muted}>{Math.abs(data.kpis.revenueChange)}% vs {compareLabel}</span>
                  </div>
                )}
                <div>
                  <strong>{data.kpis.orders ? Math.round((data.kpis.itemsSold / data.kpis.orders) * 10) / 10 : 0} items</strong>
                  <span className={ui.muted}>Average items per order</span>
                </div>
                <div>
                  <strong>{data.kpis.returningCustomerRate}%</strong>
                  <span className={ui.muted}>Of customers this period have ordered before</span>
                </div>
                <div>
                  <strong>{data.lowStock.length}</strong>
                  <span className={ui.muted}>Low-stock items to review</span>
                </div>
              </div>
            </section>
          </div>
        </>
      ))}

      {tab === 'discounts' && (
        <section className={`${ui.card} ${styles.analyticsCard}`}>
          <div className={styles.cardHead}>
            <div>
              <h3>Sales by discount</h3>
              <p className={ui.muted}>How each discount code performed in the selected period</p>
            </div>
            {discounts && discounts.rows.length > 0 && <button className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSmall}`} onClick={exportDiscountsCsv}><Download size={14} /> Export</button>}
          </div>
          {discountsError && <div className={`${ui.alert} ${ui.alertDanger}`} style={{ margin: 20 }}>{discountsError}</div>}
          {discountsLoading && !discounts ? (
            <div className={`${ui.card} ${styles.skeleton}`} style={{ margin: 20 }} />
          ) : discounts && (
            !discounts.rows.length ? (
              <div className={ui.empty}><Tag size={28} /><h3>No discounts used yet</h3><p className={ui.muted}>Discount performance for this period will show up here once customers start using codes.</p></div>
            ) : (
              <div className={ui.tableWrap}>
                <table className={`${ui.table} productTable`}>
                  <thead><tr><th>Code</th><th>Type</th><th>Times used</th><th>Discount given</th><th>Revenue</th></tr></thead>
                  <tbody>
                    {discounts.rows.map(r => (
                      <tr key={r.code}>
                        <td><strong>{r.code}</strong>{r.isAutomatic && <span className={ui.statusPill} style={{ marginLeft: 8 }}>Automatic</span>}</td>
                        <td><span className={styles.discountType}>{r.type?.replace(/_/g, ' ') || '—'}</span></td>
                        <td>{r.timesUsed}</td>
                        <td>{money(r.discountGiven)}</td>
                        <td>{money(r.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </section>
      )}
    </div>
  )
}

function Metric({ icon, label, value, change, compareLabel, sparkline }: { icon: React.ReactNode; label: string; value: React.ReactNode; change?: number | null; compareLabel?: string; sparkline?: number[] }) {
  return (
    <div className={`${ui.card} ${styles.metricCard}`}>
      <div className={styles.metricHead}>
        <div className={styles.metricIcon}>{icon}</div>
      </div>
      <span className={ui.muted}>{label}</span>
      <strong>{value}</strong>
      {typeof change === 'number' && (
        <small className={change >= 0 ? styles.metricUp : styles.metricDown}>
          {change >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {Math.abs(change)}% vs {compareLabel}
        </small>
      )}
      {sparkline && sparkline.length > 1 && <Sparkline values={sparkline} />}
    </div>
  )
}
