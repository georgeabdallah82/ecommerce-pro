'use client'

import { useState } from 'react'
import s from './admin-dashboard.module.css'

// Dashboard "Sales this week": this week's daily sales (brand accent, solid) against the same
// weekdays last week (muted, dashed), one shared axis, with a hover crosshair + tooltip.
export type SalesDay = { label: string; date: string; current: number; previous: number }

const W = 640
const H = 220
const PAD = { top: 14, right: 18, bottom: 28, left: 18 }

function niceMax(value: number) {
  if (value <= 0) return 100
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / magnitude) * magnitude
}

export default function AdminSalesChart({ days, currency }: { days: SalesDay[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const format = (cents: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)
  const max = niceMax(Math.max(...days.flatMap(d => [d.current, d.previous])))
  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / Math.max(1, days.length - 1)
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom)
  const line = (key: 'current' | 'previous') => days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ')
  const area = `${line('current')} L${x(days.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
  const thisWeek = days.reduce((sum, d) => sum + d.current, 0)
  const lastWeek = days.reduce((sum, d) => sum + d.previous, 0)
  const active = hover == null ? null : days[hover]

  return <div className={s.chart}>
    <div className={s.chartLegend}>
      <span><i className={s.legendCurrent} />This week <b>{format(thisWeek)}</b></span>
      <span><i className={s.legendPrevious} />Last week <b>{format(lastWeek)}</b></span>
    </div>
    <div className={s.chartPlot} onMouseLeave={() => setHover(null)}>
      <div className={s.chartCanvas}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Sales this week ${format(thisWeek)}, last week ${format(lastWeek)}`}>
          <defs>
            <linearGradient id="adminSalesFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--chart-current)" stopOpacity=".18" />
              <stop offset="1" stopColor="var(--chart-current)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, .25, .5, .75, 1].map(t => <line key={t} x1={PAD.left} x2={W - PAD.right} y1={y(max * t)} y2={y(max * t)} className={s.gridLine} vectorEffect="non-scaling-stroke" />)}
          <path d={area} fill="url(#adminSalesFill)" />
          <path d={line('previous')} className={s.linePrevious} vectorEffect="non-scaling-stroke" />
          <path d={line('current')} className={s.lineCurrent} vectorEffect="non-scaling-stroke" />
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(0)} className={s.crosshair} vectorEffect="non-scaling-stroke" />}
          {days.map((d, i) => <rect key={d.date} x={x(i) - (W / days.length) / 2} y={0} width={W / days.length} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />)}
        </svg>
        {days.map((d, i) => <span key={d.date} className={`${s.dot} ${i === days.length - 1 ? s.dotToday : ''} ${hover === i ? s.dotActive : ''}`} style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(d.current) / H) * 100}%` }} />)}
      </div>
      <div className={s.chartAxis}>{days.map((d, i) => <span key={d.date} style={{ left: `${(x(i) / W) * 100}%` }}>{d.label}</span>)}</div>
      {active && hover != null && (
        <div className={s.tooltip} style={{ left: `${(x(hover) / W) * 100}%` }}>
          <strong>{active.date}</strong>
          <span><i className={s.legendCurrent} />This week <b>{format(active.current)}</b></span>
          <span><i className={s.legendPrevious} />Last week <b>{format(active.previous)}</b></span>
        </div>
      )}
    </div>
  </div>
}
