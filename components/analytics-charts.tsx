'use client'

import { useMemo, useRef, useState } from 'react'
import styles from './admin-analytics.module.css'

type Point = { date: string; value: number }

function niceMax(value: number) {
  if (value <= 0) return 10
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  const normalized = value / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

function pathFor(points: { x: number; y: number }[]) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
}

/**
 * A multi-series line/area chart, built as inline SVG (no charting library):
 * crosshair + shared tooltip on hover, a legend only when a comparison series
 * is present, and a "view as table" accessibility twin below the plot -- see
 * the dataviz skill's interaction/marks specs this follows.
 */
export function LineChart({
  current, previous, currentLabel = 'This period', previousLabel = 'Previous period',
  formatValue = (v: number) => String(v), formatDate = (d: string) => d, height = 260,
}: {
  current: Point[]
  previous?: Point[] | null
  currentLabel?: string
  previousLabel?: string
  formatValue?: (v: number) => string
  formatDate?: (d: string) => string
  height?: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const width = 960
  const padding = { top: 16, right: 16, bottom: 32, left: 56 }
  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom

  const maxValue = useMemo(() => niceMax(Math.max(1, ...current.map(p => p.value), ...(previous || []).map(p => p.value))), [current, previous])
  const count = current.length
  const xFor = (i: number) => padding.left + (count > 1 ? (i / (count - 1)) * plotW : plotW / 2)
  const yFor = (v: number) => padding.top + plotH - (v / maxValue) * plotH

  const currentPts = current.map((p, i) => ({ x: xFor(i), y: yFor(p.value) }))
  const previousPts = (previous || []).map((p, i) => ({ x: xFor(i), y: yFor(p.value) }))
  const areaPath = currentPts.length ? `${pathFor(currentPts)} L${currentPts[currentPts.length - 1].x.toFixed(2)},${(padding.top + plotH).toFixed(2)} L${currentPts[0].x.toFixed(2)},${(padding.top + plotH).toFixed(2)} Z` : ''

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
  const labelEvery = Math.max(1, Math.ceil(count / 7))

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg || count === 0) return
    const rect = svg.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * width
    const ratio = count > 1 ? Math.max(0, Math.min(1, (relX - padding.left) / plotW)) : 0
    setHoverIndex(Math.round(ratio * (count - 1)))
  }

  const hovered = hoverIndex !== null ? current[hoverIndex] : null
  const hoveredPrev = hoverIndex !== null ? (previous || [])[hoverIndex] : null
  const tooltipLeft = hoverIndex !== null ? xFor(hoverIndex) / width * 100 : 0
  const tooltipAlign = tooltipLeft > 65 ? 'right' : tooltipLeft < 15 ? 'left' : 'center'

  return (
    <div className={styles.chartWrap}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={styles.chartSvg}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
        role="img"
        aria-label={`${currentLabel} chart`}
      >
        {gridLines.map(g => {
          const y = padding.top + plotH * (1 - g)
          return <g key={g}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className={styles.gridLine} />
            <text x={padding.left - 10} y={y} textAnchor="end" dominantBaseline="middle" className={styles.axisLabel}>{formatValue(Math.round(maxValue * g))}</text>
          </g>
        })}

        {areaPath && <path d={areaPath} className={styles.areaFill} />}
        {previousPts.length > 0 && <path d={pathFor(previousPts)} className={styles.linePrevious} />}
        {currentPts.length > 0 && <path d={pathFor(currentPts)} className={styles.lineCurrent} />}

        {current.map((p, i) => (i % labelEvery === 0 || i === count - 1) && (
          <text key={p.date} x={xFor(i)} y={height - 8} textAnchor="middle" className={styles.axisLabel}>{formatDate(p.date)}</text>
        ))}

        {hoverIndex !== null && (
          <g>
            <line x1={xFor(hoverIndex)} x2={xFor(hoverIndex)} y1={padding.top} y2={padding.top + plotH} className={styles.crosshair} />
            {hoveredPrev && <circle cx={xFor(hoverIndex)} cy={yFor(hoveredPrev.value)} r={5} className={styles.dotPrevious} />}
            {hovered && <circle cx={xFor(hoverIndex)} cy={yFor(hovered.value)} r={5} className={styles.dotCurrent} />}
          </g>
        )}
      </svg>

      {hovered && (
        <div className={styles.tooltip} style={{ left: `${tooltipLeft}%` }} data-align={tooltipAlign}>
          <div className={styles.tooltipDate}>{formatDate(hovered.date)}</div>
          <div className={styles.tooltipRow}><span className={styles.keyCurrent} />{currentLabel}<strong>{formatValue(hovered.value)}</strong></div>
          {hoveredPrev && <div className={styles.tooltipRow}><span className={styles.keyPrevious} />{previousLabel}<strong>{formatValue(hoveredPrev.value)}</strong></div>}
        </div>
      )}

      {previous && previous.length > 0 && (
        <div className={styles.legend}>
          <span><i className={styles.keyCurrent} />{currentLabel}</span>
          <span><i className={styles.keyPrevious} />{previousLabel}</span>
        </div>
      )}

      <details className={styles.tableToggle}>
        <summary>View as table</summary>
        <div className={styles.tableScroll}>
          <table>
            <thead><tr><th>Date</th><th>{currentLabel}</th>{previous && <th>{previousLabel}</th>}</tr></thead>
            <tbody>{current.map((p, i) => <tr key={p.date}><td>{formatDate(p.date)}</td><td>{formatValue(p.value)}</td>{previous && <td>{previous[i] ? formatValue(previous[i].value) : '—'}</td>}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

/** A minimal trend indicator for a stat tile: history in the de-emphasis hue, the latest point picked out in the accent. */
export function Sparkline({ values, width = 96, height = 32 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const max = Math.max(1, ...values)
  const min = Math.min(0, ...values)
  const range = max - min || 1
  const points = values.map((v, i) => ({ x: (i / (values.length - 1)) * width, y: height - ((v - min) / range) * height }))
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={styles.sparkline} aria-hidden="true">
      <path d={pathFor(points)} className={styles.sparklineLine} />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} className={styles.sparklineDot} />
    </svg>
  )
}
