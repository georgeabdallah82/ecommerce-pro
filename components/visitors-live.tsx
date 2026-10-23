'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RefreshCw, ShoppingCart, Users, CreditCard, Receipt, Smartphone, Monitor, Tablet, UserRound, Repeat } from 'lucide-react'
import type { LiveReport, OnlineRow, TodayReport } from '@/lib/visitor-report'
import { STAGES, STAGE_LABELS, type Stage } from '@/lib/visitor-tracking'
import s from './visitors-live.module.css'

// Admin > Live visitors. Numbers come from lib/visitor-report.ts through /api/admin/visitors. The
// "online now" part refreshes often and the day's summary less often, only while this page is on
// screen (a page left open in a background tab must not keep the database awake).

const LIVE_EVERY_MS = 10_000
const TODAY_EVERY_MS = 60_000
const FILTERS: Array<'all' | Stage> = ['all', 'browsing', 'product', 'cart', 'checkout', 'ordered']

function money(cents: number, currency: string) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100) } catch { return `${currency} ${(cents / 100).toFixed(2)}` }
}
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function DeviceIcon({ agent }: { agent: string }) {
  if (/iPad|tablet/i.test(agent)) return <Tablet size={16} aria-hidden="true" />
  if (/iPhone|phone/i.test(agent)) return <Smartphone size={16} aria-hidden="true" />
  return <Monitor size={16} aria-hidden="true" />
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint: React.ReactNode }) {
  return <div className={s.kpi}>
    <div className={s.kpiTop}><span>{label}</span><i aria-hidden="true">{icon}</i></div>
    <strong>{value}</strong>
    <small>{hint}</small>
  </div>
}

function Bar({ label, value, percent, hint }: { label: string; value: number; percent: number; hint?: string }) {
  return <li className={s.barRow}>
    <div className={s.barTop}><span>{label}</span><b>{value}<em> · {percent}%</em></b></div>
    <div className={s.barTrack} aria-hidden="true"><div className={s.barFill} style={{ width: `${Math.max(percent, value ? 3 : 0)}%` }} /></div>
    {hint ? <small className={s.barHint}>{hint}</small> : null}
  </li>
}

function VisitorCard({ v, currency }: { v: OnlineRow; currency: string }) {
  return <li className={s.visitor}>
    <div className={s.visitorTop}>
      <strong className={s.pageName}>{v.page}</strong>
      <span className={`${s.chip} ${s[`stage_${v.stage}`]}`}>{v.stageLabel}</span>
    </div>
    <div className={s.visitorMeta}>
      <span className={s.metaItem}><DeviceIcon agent={v.agent} />{v.agent}</span>
      <span className={s.metaItem}>{v.place}</span>
      <span className={s.metaItem}>From {v.source}</span>
    </div>
    <div className={s.visitorFoot}>
      <span>{v.onSite} on the store · {plural(v.pageViews, 'page')}</span>
      {v.cartItems > 0 ? <span className={s.cartBadge}><ShoppingCart size={13} aria-hidden="true" />{plural(v.cartItems, 'item')} · {money(v.cartValue, currency)}</span> : null}
      {v.name ? <span className={s.badge}><UserRound size={13} aria-hidden="true" />{v.name}</span> : null}
      <span className={s.badge}>{v.cameBefore ? <><Repeat size={13} aria-hidden="true" />Came before</> : 'New visitor'}</span>
    </div>
  </li>
}

export default function VisitorsLive({ initialLive, initialToday }: { initialLive: LiveReport; initialToday: TodayReport }) {
  const [live, setLive] = useState(initialLive)
  const [today, setToday] = useState(initialToday)
  const [filter, setFilter] = useState<'all' | Stage>('all')
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [showAll, setShowAll] = useState(false)
  const lastToday = useRef(Date.now())

  const load = useCallback(async (scope: 'live' | 'today') => {
    const response = await fetch(`/api/admin/visitors?scope=${scope}`, { cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.error || 'Unable to load visitors')
    if (scope === 'live') setLive(data as LiveReport)
    else { setToday(data as TodayReport); lastToday.current = Date.now() }
  }, [])

  const refresh = useCallback(async (both: boolean) => {
    setBusy(true)
    try {
      setError('')
      await Promise.all([load('live'), both || Date.now() - lastToday.current >= TODAY_EVERY_MS ? load('today') : Promise.resolve()])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to refresh')
    } finally {
      setBusy(false)
      setNow(Date.now())
    }
  }, [load])

  // Refresh only while this page is on screen and not paused.
  useEffect(() => {
    if (paused) return
    const tick = () => { if (document.visibilityState === 'visible') refresh(false) }
    const timer = window.setInterval(tick, LIVE_EVERY_MS)
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(false) }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [paused, refresh])
  // "Updated 5 s ago" keeps counting.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const ageSeconds = Math.max(0, Math.round((now - new Date(live.generatedAt).getTime()) / 1000))
  const shown = useMemo(() => (filter === 'all' ? live.visitors : live.visitors.filter(v => v.stage === filter)), [live.visitors, filter])
  const visible = showAll ? shown : shown.slice(0, 20)
  const peak = Math.max(1, ...today.hourly)
  const peakHour = today.hourly.indexOf(Math.max(...today.hourly))
  const stages = STAGES.filter(stage => stage !== 'ordered')
  const nowHour = new Date(now).toLocaleString('en-GB', { timeZone: today.timezone, hour: '2-digit', hourCycle: 'h23' })

  return <div className={s.page}>
    <div className={s.head}>
      <div>
        <div className={s.kicker}><span className={`${s.dot} ${paused ? s.dotOff : ''}`} aria-hidden="true" />{paused ? 'Paused' : 'Live'}</div>
        <p className={s.updated} role="status">{error ? <span className={s.err}>{error}. Showing the last numbers.</span> : `Updated ${ageSeconds < 5 ? 'just now' : `${ageSeconds} s ago`}`}</p>
      </div>
      <div className={s.actions}>
        <button type="button" className={s.btn} onClick={() => setPaused(p => !p)} aria-pressed={paused}>{paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}{paused ? 'Resume' : 'Pause'}</button>
        <button type="button" className={s.btn} onClick={() => refresh(true)} disabled={busy}><RefreshCw size={15} aria-hidden="true" />Refresh</button>
      </div>
    </div>

    <div className={s.kpis}>
      <Kpi icon={<Users size={18} />} label="Online now" value={live.online} hint={live.online === 0 ? 'Nobody on the store right now' : `${plural(live.byStage.browsing + live.byStage.product, 'person', 'people')} looking around`} />
      <Kpi icon={<ShoppingCart size={18} />} label="With items in the cart" value={live.withCart} hint={live.withCart ? `${money(live.cartValue, live.currency)} waiting` : 'No open carts'} />
      <Kpi icon={<CreditCard size={18} />} label="Checking out" value={live.byStage.checkout} hint={live.byStage.checkout ? 'About to order' : 'Nobody at checkout'} />
      <Kpi icon={<Receipt size={18} />} label="Orders today" value={today.ordersToday} hint={`${money(today.salesToday, today.currency)} · ${today.conversionPercent}% of visitors ordered`} />
    </div>

    <section className={s.panel} aria-labelledby="vl-now">
      <h2 id="vl-now" className={s.h2}>Right now</h2>
      <ul className={s.funnelNow}>
        {stages.map(stage => <li key={stage}>
          <button type="button" className={`${s.stageBtn} ${filter === stage ? s.stageOn : ''}`} aria-pressed={filter === stage} onClick={() => setFilter(f => (f === stage ? 'all' : stage))}>
            <span>{STAGE_LABELS[stage]}</span><b>{live.byStage[stage]}</b>
            <i aria-hidden="true"><u style={{ width: `${live.online ? Math.round((live.byStage[stage] / live.online) * 100) : 0}%` }} /></i>
          </button>
        </li>)}
      </ul>
    </section>

    <section className={s.panel} aria-labelledby="vl-who">
      <h2 id="vl-who" className={s.h2}>Who is on the store</h2>
      <div className={s.chips} role="group" aria-label="Show visitors by step">
        {FILTERS.map(f => {
          const count = f === 'all' ? live.online : live.byStage[f]
          if (f === 'ordered' && !count && filter !== 'ordered') return null
          return <button type="button" key={f} className={`${s.filterChip} ${filter === f ? s.filterOn : ''}`} aria-pressed={filter === f} onClick={() => { setFilter(f); setShowAll(false) }}>{f === 'all' ? 'Everyone' : STAGE_LABELS[f]} <b>{count}</b></button>
        })}
      </div>
      {shown.length === 0
        ? <div className={s.empty}><Users size={22} aria-hidden="true" /><strong>{filter === 'all' ? 'No one is on the store right now' : 'No one is at this step right now'}</strong><span>{filter === 'all' ? 'People appear here while they browse, usually within a few seconds. You and your staff are never counted.' : 'Try another step.'}</span></div>
        : <ul className={s.list}>{visible.map(v => <VisitorCard key={v.id} v={v} currency={live.currency} />)}</ul>}
      {shown.length > visible.length ? <button type="button" className={`${s.btn} ${s.more}`} onClick={() => setShowAll(true)}>Show all {shown.length}</button> : null}
    </section>

    <section className={s.panel} aria-labelledby="vl-today">
      <h2 id="vl-today" className={s.h2}>Today <small>(store time, since midnight)</small></h2>
      <div className={s.todayKpis}>
        <div><strong>{today.visitors}</strong><span>Visitors</span></div>
        <div><strong>{today.pageViews}</strong><span>Pages viewed</span></div>
        <div><strong>{today.pagesPerVisit}</strong><span>Pages per visit</span></div>
        <div><strong>{today.returningPercent}%</strong><span>Came before</span></div>
      </div>

      <h3 className={s.h3}>Visitors by hour</h3>
      <div className={s.chart} role="img" aria-label={today.visitors ? `Visitors per hour today. Busiest hour ${hourLabel(peakHour)} with ${plural(today.hourly[peakHour], 'visitor')}.` : 'No visitors yet today.'}>
        {today.hourly.map((count, hour) => <div key={hour} className={`${s.col} ${hour === Number(nowHour) ? s.colNow : ''}`} title={`${hourLabel(hour)}: ${plural(count, 'visitor')}`}>
          <i style={{ height: `${count ? Math.max(6, Math.round((count / peak) * 100)) : 0}%` }} />
          {hour % 6 === 0 ? <em>{String(hour).padStart(2, '0')}</em> : null}
        </div>)}
      </div>

      <h3 className={s.h3}>Visits that reached each step</h3>
      <ul className={s.bars}>{today.funnel.map(row => <Bar key={row.stage} label={row.stage === 'browsing' ? 'Visited the store' : row.stage === 'product' ? 'Looked at a product' : row.stage === 'cart' ? 'Opened the cart' : row.stage === 'checkout' ? 'Reached checkout' : 'Placed an order'} value={row.count} percent={row.ofAll} hint={row.stage !== 'browsing' && row.count ? `${row.ofPrevious}% of the step before` : undefined} />)}</ul>

      <div className={s.cols}>
        <div>
          <h3 className={s.h3}>Most viewed pages</h3>
          {today.topPages.length ? <ol className={s.rank}>{today.topPages.map(p => <li key={p.path}><span title={p.path}>{p.title}</span><b>{p.views}</b></li>)}</ol> : <p className={s.none}>No page views yet today.</p>}
        </div>
        <div>
          <h3 className={s.h3}>Where visitors come from</h3>
          {today.sources.length ? <ul className={s.bars}>{today.sources.map(r => <Bar key={r.key} label={r.label} value={r.count} percent={r.percent} />)}</ul> : <p className={s.none}>No visits yet today.</p>}
        </div>
        <div>
          <h3 className={s.h3}>Devices</h3>
          {today.devices.length ? <ul className={s.bars}>{today.devices.map(r => <Bar key={r.key} label={r.key === 'mobile' ? 'Phones' : r.key === 'tablet' ? 'Tablets' : r.key === 'desktop' ? 'Computers' : 'Unknown'} value={r.count} percent={r.percent} />)}</ul> : <p className={s.none}>No visits yet today.</p>}
        </div>
        <div>
          <h3 className={s.h3}>Where they are</h3>
          {today.places.length ? <ul className={s.bars}>{today.places.map(r => <Bar key={r.key} label={r.key} value={r.count} percent={r.percent} />)}</ul> : <p className={s.none}>No visits yet today.</p>}
        </div>
      </div>
      {today.truncated ? <p className={s.note}>Busy day: the lists above use the latest 5,000 visits. The totals are exact.</p> : null}
      <p className={s.note}>Location is approximate (from the visitor&apos;s network) and no IP addresses are saved. Visits are kept for 90 days.</p>
    </section>
  </div>
}
