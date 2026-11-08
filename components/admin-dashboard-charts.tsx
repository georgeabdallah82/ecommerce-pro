import type { CSSProperties } from 'react'
import s from './admin-dashboard-v2.module.css'

// Dashboard charts drawn as SVG on the server: no client script. Each mark animates in with CSS,
// and the motion is switched off for people who ask for reduced motion.

function niceMax(value: number) {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / magnitude) * magnitude
}

export function MonthlyBars({ bars, label }: { bars: { label: string; value: number; title: string; highlight?: boolean }[]; label: string }) {
  const W = 680, H = 240, PAD = { top: 16, right: 8, bottom: 30, left: 40 }
  const max = niceMax(Math.max(0, ...bars.map(b => b.value)))
  const slot = (W - PAD.left - PAD.right) / Math.max(1, bars.length)
  const plotH = H - PAD.top - PAD.bottom
  const y = (v: number) => PAD.top + (1 - v / max) * plotH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(max * f))
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className={s.chart}>
    {ticks.map(t => <g key={t}>
      <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={s.grid} />
      <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className={s.axis}>{t}</text>
    </g>)}
    {bars.map((b, i) => {
      const cx = PAD.left + slot * (i + 0.5)
      const h = (b.value / max) * plotH
      return <g key={b.label}>
        <title>{b.title}</title>
        <rect x={cx - slot * 0.25} y={PAD.top + plotH - h} width={slot * 0.5} height={Math.max(0, h)} rx={4} className={b.highlight ? s.barHi : s.bar} style={{ animationDelay: `${i * 40}ms` }} />
        <text x={cx} y={H - 8} textAnchor="middle" className={s.axis}>{b.label}</text>
      </g>
    })}
  </svg>
}

// Net sales per month this year (solid) against the same months last year (muted, dashed).
export function YearAreas({ labels, current, previous, format, label }: { labels: string[]; current: number[]; previous: number[]; format: (cents: number) => string; label: string }) {
  const W = 760, H = 280, PAD = { top: 16, right: 12, bottom: 30, left: 56 }
  const max = niceMax(Math.max(0, ...current, ...previous))
  const plotH = H - PAD.top - PAD.bottom
  const plotW = W - PAD.left - PAD.right
  const x = (i: number) => PAD.left + (i * plotW) / Math.max(1, labels.length - 1)
  const y = (v: number) => PAD.top + (1 - v / max) * plotH
  const line = (series: number[]) => series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line(current)} L${x(labels.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => max * f)
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className={s.chart}>
    {ticks.map(t => <g key={t}>
      <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={s.grid} />
      <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className={s.axis}>{format(t)}</text>
    </g>)}
    <path d={area} className={s.areaFill} />
    <path d={line(previous)} className={s.lineMuted} />
    <path d={line(current)} className={s.lineAccent} />
    {labels.map((m, i) => <text key={m + i} x={x(i)} y={H - 8} textAnchor="middle" className={s.axis}>{m}</text>)}
  </svg>
}

// Half-circle gauge. `percent` is shown as a progress arc (capped at 100); null draws an empty track.
export function Gauge({ percent, label }: { percent: number | null; label: string }) {
  const p = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  const theta = Math.PI * (1 - p / 100)
  const ex = 130 + 100 * Math.cos(theta)
  const ey = 130 - 100 * Math.sin(theta)
  return <svg viewBox="0 0 260 150" role="img" aria-label={label} className={s.gauge}>
    <path d="M 30 130 A 100 100 0 0 1 230 130" pathLength={100} className={s.gaugeTrack} />
    <path d={`M 30 130 A 100 100 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`} pathLength={100} className={s.gaugeProgress} style={{ ['--p' as string]: String(p) } as CSSProperties} />
  </svg>
}
