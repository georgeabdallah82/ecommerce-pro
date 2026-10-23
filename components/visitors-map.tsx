'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { OnlineRow, PinRow } from '@/lib/visitor-report'
import { DEFAULT_MAP_VIEW, groupDots } from '@/lib/visitor-map'
import s from './visitors-map.module.css'

// The live map (rules in lib/visitor-map.ts). Loaded only in the browser (components/visitors-live.tsx):
// Leaflet reads `window` as soon as it is imported. Soft circles are visitors' APPROXIMATE places (about
// 10 km, from their internet connection); solid pins are EXACT spots shoppers chose to share at checkout.

// Radius of the soft circle: it shows how rough the place is.
const APPROX_RADIUS_M = 9000

function popup(title: string, lines: string[]) {
  const box = document.createElement('div')
  const head = document.createElement('strong')
  head.textContent = title
  box.appendChild(head)
  for (const line of lines) {
    const p = document.createElement('div')
    p.textContent = line
    box.appendChild(p)
  }
  return box
}

export default function VisitorsMap({ visitors, pins, currency }: { visitors: OnlineRow[]; pins: PinRow[]; currency: string }) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const fitted = useRef(false)

  useEffect(() => {
    if (!host.current || map.current) return
    const m = L.map(host.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([DEFAULT_MAP_VIEW.lat, DEFAULT_MAP_VIEW.lng], DEFAULT_MAP_VIEW.zoom)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => { m.remove(); map.current = null; layer.current = null; fitted.current = false }
  }, [])

  useEffect(() => {
    const m = map.current, group = layer.current
    if (!m || !group) return
    group.clearLayers()
    const bounds: L.LatLngExpression[] = []

    // Visitors: one soft circle per rounded place, with how many are there.
    const dots = groupDots(visitors.flatMap(v => v.lat !== null && v.lng !== null ? [{ lat: v.lat, lng: v.lng, label: `${v.page} · ${v.stageLabel}` }] : []))
    for (const d of dots) {
      L.circle([d.lat, d.lng], { radius: APPROX_RADIUS_M, color: '#2563eb', weight: 1, fillColor: '#2563eb', fillOpacity: 0.16, interactive: false }).addTo(group)
      const icon = L.divIcon({ className: '', html: `<span class="${s.count}">${d.count}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] })
      L.marker([d.lat, d.lng], { icon, title: `${d.count} visitor${d.count === 1 ? '' : 's'} near here (approximate)`, keyboard: true })
        .bindPopup(popup(`${d.count} visitor${d.count === 1 ? '' : 's'} near here`, ['Approximate place (about 10 km)', ...d.labels]))
        .addTo(group)
      bounds.push([d.lat, d.lng])
    }

    // Unfinished checkouts: the exact spot the shopper shared.
    for (const p of pins) {
      if (p.accuracy && p.accuracy > 15) L.circle([p.lat, p.lng], { radius: Math.min(p.accuracy, 2000), color: '#d7261e', weight: 1, fillColor: '#d7261e', fillOpacity: 0.1, interactive: false }).addTo(group)
      const icon = L.divIcon({ className: '', html: `<span class="${s.pin}"></span>`, iconSize: [22, 22], iconAnchor: [11, 11] })
      const money = (() => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(p.subtotal / 100) } catch { return '' } })()
      L.marker([p.lat, p.lng], { icon, title: `${p.name}: exact spot, checkout not finished`, keyboard: true })
        .bindPopup(popup(p.name, ['Exact spot shared at checkout', p.place, `Left ${p.minutesAgo < 60 ? `${p.minutesAgo} min` : `${Math.round(p.minutesAgo / 60)} h`} ago${money ? ` · ${money}` : ''}`]))
        .addTo(group)
      bounds.push([p.lat, p.lng])
    }

    // Fit the map to the dots once (not on every refresh, so panning is not undone).
    if (!fitted.current && bounds.length) {
      fitted.current = true
      if (bounds.length === 1) m.setView(bounds[0], 11)
      else m.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 12 })
    }
  }, [visitors, pins, currency])

  return <div className={s.wrap}>
    <div ref={host} className={s.map} role="region" aria-label="Map of visitors online now. The same people are listed below the map." />
    {!visitors.some(v => v.lat !== null) && !pins.length ? <div className={s.empty}>Nobody to show on the map yet</div> : null}
  </div>
}
