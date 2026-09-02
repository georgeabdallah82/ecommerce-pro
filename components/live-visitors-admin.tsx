'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import {
  Activity,
  Crosshair,
  ExternalLink,
  Globe2,
  LocateFixed,
  MapPin,
  Maximize2,
  Minus,
  Monitor,
  Navigation,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Smartphone,
  Tablet,
  Users,
  X,
} from 'lucide-react'
import type { Map as LeafletMap, Marker } from 'leaflet'
import L from 'leaflet'

type Visitor = {
  sessionId: string
  userId: string | null
  name: string | null
  path: string
  country: string | null
  city: string | null
  region: string | null
  latitude: number | null
  longitude: number | null
  device: string | null
  browser: string | null
  os: string | null
  referrer: string | null
  firstSeenAt: string
  lastSeenAt: string
}

function relativeTime(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ago`
}

function DeviceIcon({ device }: { device: string | null }) {
  if (device === 'mobile') return <Smartphone size={15} />
  if (device === 'tablet') return <Tablet size={15} />
  return <Monitor size={15} />
}

function locationLabel(v: Visitor) {
  return [v.city, v.region, v.country].filter(Boolean).join(', ') || 'Location unavailable'
}

function initials(v: Visitor) {
  const value = v.name?.trim() || 'Visitor'
  return value.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'V'
}

function createVisitorIcon(selected: boolean) {
  return L.divIcon({
    className: 'lv-marker-host',
    html: `<span class="lv-marker ${selected ? 'is-selected' : ''}"><span class="lv-marker-ring"></span><span class="lv-marker-core"></span></span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  })
}

function MapPanel({ visitors, selectedId, onSelect }: { visitors: Visitor[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const mapElement = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markersRef = useRef<Map<string, Marker>>(new Map())
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState(false)
  const located = useMemo(() => visitors.filter(v => Number.isFinite(v.latitude) && Number.isFinite(v.longitude)), [visitors])

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return

    const map = L.map(mapElement.current, {
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 19,
    }).setView([33.8938, 35.5018], 7)

    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    })

    tiles.on('tileerror', () => setMapError(true))
    tiles.on('load', () => setMapError(false))
    tiles.addTo(map)

    mapRef.current = map
    setMapReady(true)
    window.setTimeout(() => map.invalidateSize(), 100)

    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current.clear()
      setMapReady(false)
    }
  }, [])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    const activeIds = new Set(located.map(v => v.sessionId))

    markersRef.current.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.removeFrom(map)
        markersRef.current.delete(id)
      }
    })

    located.forEach(visitor => {
      const latitude = visitor.latitude as number
      const longitude = visitor.longitude as number
      let marker = markersRef.current.get(visitor.sessionId)

      if (!marker) {
        marker = L.marker([latitude, longitude], {
          icon: createVisitorIcon(visitor.sessionId === selectedId),
          keyboard: true,
          title: visitor.name || 'Anonymous visitor',
        }).addTo(map)
        marker.on('click', () => onSelect(visitor.sessionId))
        markersRef.current.set(visitor.sessionId, marker)
      } else {
        marker.setLatLng([latitude, longitude])
        marker.setIcon(createVisitorIcon(visitor.sessionId === selectedId))
      }

      marker.bindTooltip(`<strong>${visitor.name || 'Anonymous visitor'}</strong><br>${locationLabel(visitor)}<br><span>${visitor.path}</span>`, {
        direction: 'top',
        offset: [0, -18],
        opacity: 0.98,
        className: 'lv-tooltip',
      })
    })
  }, [located, mapReady, onSelect, selectedId])

  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedId) return
    const selected = located.find(v => v.sessionId === selectedId)
    if (!selected || selected.latitude == null || selected.longitude == null) return
    mapRef.current.flyTo([selected.latitude, selected.longitude], Math.max(mapRef.current.getZoom(), 14), { duration: 0.65 })
  }, [located, mapReady, selectedId])

  const fitAll = () => {
    if (!mapRef.current || located.length === 0) return
    const bounds = L.latLngBounds(located.map(v => [v.latitude as number, v.longitude as number] as [number, number]))
    mapRef.current.fitBounds(bounds.pad(located.length === 1 ? 0.8 : 0.18), { maxZoom: 14, animate: true, duration: 0.7 })
  }

  const centerSelected = () => {
    if (!mapRef.current || !selectedId) return
    const selected = located.find(v => v.sessionId === selectedId)
    if (!selected || selected.latitude == null || selected.longitude == null) return
    mapRef.current.flyTo([selected.latitude, selected.longitude], 15, { duration: 0.65 })
  }

  return (
    <div className="lv-map-shell">
      <style jsx global>{`
        .lv-map-shell{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:22px;background:#dfe5e8;box-shadow:0 12px 32px rgba(23,23,23,.06)}
        .lv-map-canvas{height:560px;width:100%;background:#dfe5e8}
        .lv-map-canvas .leaflet-tile{filter:saturate(.82) contrast(.98)}
        .lv-marker-host{background:transparent!important;border:0!important}
        .lv-marker{position:relative;display:flex;width:42px;height:42px;align-items:center;justify-content:center}
        .lv-marker-ring{position:absolute;width:38px;height:38px;border-radius:999px;background:rgba(22,163,74,.16);animation:lv-pulse 2.2s ease-out infinite}
        .lv-marker-core{position:relative;z-index:2;width:16px;height:16px;border:3px solid #fff;border-radius:999px;background:#16a34a;box-shadow:0 4px 14px rgba(0,0,0,.28)}
        .lv-marker.is-selected .lv-marker-core{width:21px;height:21px;background:var(--ink);box-shadow:0 5px 18px rgba(0,0,0,.35)}
        .lv-marker.is-selected .lv-marker-ring{background:rgba(23,23,23,.16);animation-duration:1.5s}
        .lv-tooltip{border:1px solid var(--line)!important;border-radius:12px!important;background:rgba(255,255,255,.98)!important;color:var(--ink)!important;box-shadow:0 12px 30px rgba(23,23,23,.16)!important;padding:8px 10px!important;font-size:12px!important}
        .lv-tooltip:before{display:none!important}
        .leaflet-control-attribution{border-radius:10px 0 0 0;font-size:10px}
        .leaflet-control-attribution a{color:inherit;text-decoration:underline}
        .lv-map-overlay{position:absolute;z-index:500;display:flex;align-items:center;gap:10px;border:1px solid rgba(232,232,227,.95);background:rgba(255,255,255,.95);box-shadow:0 10px 28px rgba(23,23,23,.12);backdrop-filter:blur(16px)}
        .lv-map-status{top:16px;left:16px;padding:10px 13px;border-radius:14px;font-size:12px;font-weight:800}
        .lv-map-status-dot{width:8px;height:8px;border-radius:99px;background:#16a34a;box-shadow:0 0 0 5px rgba(22,163,74,.12)}
        .lv-map-controls{top:16px;right:16px;display:grid;gap:7px}
        .lv-map-btn{display:grid;width:40px;height:40px;place-items:center;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.97);color:var(--ink);cursor:pointer;box-shadow:0 8px 22px rgba(23,23,23,.1)}
        .lv-map-btn:hover{background:#f7f7f3}
        .lv-map-btn:disabled{opacity:.35;cursor:not-allowed}
        .lv-map-legend{bottom:16px;left:16px;padding:9px 11px;border-radius:13px;font-size:11px;color:var(--muted)}
        .lv-legend-item{display:inline-flex;align-items:center;gap:7px;margin-right:12px;font-weight:700;color:var(--ink)}
        .lv-legend-dot{width:8px;height:8px;border-radius:99px;background:#16a34a}
        .lv-legend-dot.approx{background:#2563eb}
        .lv-map-empty{position:absolute;z-index:510;inset:78px 24px 70px;display:flex;align-items:center;justify-content:center;pointer-events:none}
        .lv-map-empty-card{max-width:390px;padding:24px;border:1px solid rgba(232,232,227,.98);border-radius:22px;background:rgba(255,255,255,.94);box-shadow:0 18px 44px rgba(23,23,23,.14);text-align:center;backdrop-filter:blur(18px);pointer-events:auto}
        .lv-map-error{position:absolute;z-index:520;right:16px;bottom:16px;max-width:280px;padding:10px 12px;border:1px solid #ffd1cd;border-radius:12px;background:rgba(255,247,246,.97);color:#8a2117;font-size:11px;font-weight:700;box-shadow:0 10px 26px rgba(23,23,23,.1)}
        @keyframes lv-pulse{0%{transform:scale(.62);opacity:.82}72%{transform:scale(1.34);opacity:.06}100%{transform:scale(.62);opacity:.82}}
        @media(max-width:700px){.lv-map-canvas{height:430px}.lv-map-status{top:11px;left:11px}.lv-map-controls{top:11px;right:11px}.lv-map-legend{left:11px;bottom:11px}.lv-map-error{right:11px;bottom:11px}}
      `}</style>

      <div ref={mapElement} className="lv-map-canvas" />

      <div className="lv-map-overlay lv-map-status">
        <span className="lv-map-status-dot" />
        <span>LIVE VISITOR MAP</span>
        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{located.length} precise</span>
      </div>

      <div className="lv-map-overlay lv-map-controls">
        <button type="button" className="lv-map-btn" onClick={fitAll} disabled={!located.length} aria-label="Fit all visitors" title="Fit all visitors"><Maximize2 size={16} /></button>
        <button type="button" className="lv-map-btn" onClick={centerSelected} disabled={!selectedId} aria-label="Center selected visitor" title="Center selected visitor"><Crosshair size={16} /></button>
        <button type="button" className="lv-map-btn" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in" title="Zoom in"><Plus size={16} /></button>
        <button type="button" className="lv-map-btn" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out" title="Zoom out"><Minus size={16} /></button>
      </div>

      <div className="lv-map-overlay lv-map-legend">
        <span className="lv-legend-item"><span className="lv-legend-dot" />Precise</span>
        <span className="lv-legend-item"><span className="lv-legend-dot approx" />Approximate</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>Browser consent required</span>
      </div>

      {mapError && <div className="lv-map-error">Map tiles could not be loaded. Visitor session data is still live.</div>}

      {located.length === 0 && (
        <div className="lv-map-empty">
          <div className="lv-map-empty-card">
            <div style={{ width: 54, height: 54, margin: '0 auto', borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--soft)' }}><MapPin size={24} /></div>
            <h3 style={{ margin: '16px 0 6px', fontSize: 18 }}>Waiting for live locations</h3>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13, lineHeight: 1.65 }}>Visitors appear here when they explicitly allow precise browser location. Visitors who decline are still visible in the live session feed.</p>
            <div className="pill" style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Radio size={12} /> Listening for visitors</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LiveVisitorsAdmin() {
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(async () => {
    try {
      setError('')
      const response = await fetch('/api/admin/live-visitors', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'Unable to load live visitors')
      const nextVisitors: Visitor[] = Array.isArray(data.visitors) ? data.visitors : []
      setVisitors(nextVisitors)
      setLastUpdated(new Date())
      setSelectedId(current => current && nextVisitors.some(v => v.sessionId === current) ? current : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load live visitors')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSelect = useCallback((id: string) => setSelectedId(id), [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(load, 15_000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, load])

  const precise = useMemo(() => visitors.filter(v => Number.isFinite(v.latitude) && Number.isFinite(v.longitude)).length, [visitors])
  const countries = useMemo(() => new Set(visitors.map(v => v.country).filter(Boolean)).size, [visitors])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return visitors
    return visitors.filter(v => [v.name, v.path, v.country, v.city, v.region, v.device, v.browser, v.os].filter(Boolean).some(value => String(value).toLowerCase().includes(q)))
  }, [query, visitors])
  const selected = visitors.find(v => v.sessionId === selectedId) || null

  return (
    <section className="liveVisitors">
      <style jsx>{`
        .liveVisitors{margin-top:52px;display:grid;gap:18px}
        .lv-header{display:flex;align-items:flex-end;justify-content:space-between;gap:22px}
        .lv-kicker{display:inline-flex;align-items:center;gap:7px;font-size:11px;letter-spacing:.11em;text-transform:uppercase;font-weight:900;color:#176b35}
        .lv-live-dot{width:7px;height:7px;border-radius:99px;background:#16a34a;box-shadow:0 0 0 5px rgba(22,163,74,.1)}
        .lv-title{margin:9px 0 4px;font-size:34px;line-height:1.05;letter-spacing:-.04em}
        .lv-subtitle{margin:0;max-width:760px;color:var(--muted);font-size:14px;line-height:1.65}
        .lv-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
        .lv-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 13px;border:1px solid var(--line);border-radius:11px;background:#fff;color:var(--ink);font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 2px 6px rgba(23,23,23,.04)}
        .lv-btn:hover{background:var(--soft)}
        .lv-btn:disabled{opacity:.5;cursor:not-allowed}
        .lv-btn.active{background:var(--ink);border-color:var(--ink);color:#fff}
        .lv-error{padding:12px 14px;border:1px solid #ffd1cd;border-radius:14px;background:#fff5f4;color:#9a2418;font-size:13px}
        .lv-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
        .lv-stat{min-height:112px;padding:18px;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:0 6px 18px rgba(23,23,23,.04)}
        .lv-stat-top{display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:12px;font-weight:800}
        .lv-stat-icon{display:grid;width:34px;height:34px;place-items:center;border-radius:10px;background:var(--soft);color:var(--ink)}
        .lv-stat-value{margin-top:11px;font-size:28px;line-height:1;letter-spacing:-.04em;font-weight:900}
        .lv-stat-hint{margin-top:8px;font-size:11px;color:var(--muted)}
        .lv-main{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(320px,.75fr);gap:14px;align-items:start}
        .lv-side{border:1px solid var(--line);border-radius:22px;background:#fff;box-shadow:0 10px 28px rgba(23,23,23,.05);overflow:hidden}
        .lv-side-head{padding:17px 17px 14px;border-bottom:1px solid var(--line)}
        .lv-side-title{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .lv-side-title h3{margin:0;font-size:15px;letter-spacing:-.01em}
        .lv-side-count{padding:4px 8px;border-radius:99px;background:var(--soft);font-size:11px;font-weight:800}
        .lv-search{position:relative;margin-top:12px}
        .lv-search svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--muted)}
        .lv-search input{width:100%;height:39px;border:1px solid var(--line);border-radius:10px;background:#fafaf8;padding:0 12px 0 34px;outline:0;font-size:12px}
        .lv-search input:focus{border-color:#bbb;box-shadow:0 0 0 3px rgba(23,23,23,.06)}
        .lv-list{max-height:505px;overflow:auto}
        .lv-row{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:10px;width:100%;padding:13px 15px;border:0;border-bottom:1px solid #f0f0ec;background:#fff;text-align:left;cursor:pointer}
        .lv-row:hover{background:#fafaf8}
        .lv-row.selected{background:#f3f3ef;box-shadow:inset 3px 0 0 var(--ink)}
        .lv-avatar{display:grid;width:36px;height:36px;place-items:center;border-radius:11px;background:var(--soft);font-size:11px;font-weight:900}
        .lv-row-main{min-width:0}
        .lv-row-top{display:flex;align-items:center;gap:7px;min-width:0}
        .lv-row-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:900}
        .lv-row-status{width:6px;height:6px;flex:0 0 6px;border-radius:99px;background:#16a34a}
        .lv-row-page{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:11px}
        .lv-row-location{display:flex;align-items:center;gap:5px;margin-top:5px;overflow:hidden;color:var(--ink);font-size:11px}
        .lv-row-location span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .lv-row-meta{display:flex;flex-direction:column;align-items:flex-end;gap:6px;color:var(--muted);font-size:10px}
        .lv-row-meta .inline{display:inline-flex;align-items:center;gap:5px}
        .lv-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border:1px solid var(--line);border-radius:999px;background:#fff;font-size:9px;font-weight:900;white-space:nowrap}
        .lv-empty{padding:40px 20px;text-align:center;color:var(--muted);font-size:12px}
        .lv-detail{border:1px solid var(--line);border-radius:22px;background:#fff;padding:18px;box-shadow:0 10px 28px rgba(23,23,23,.05)}
        .lv-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
        .lv-detail-person{display:flex;align-items:center;gap:12px}
        .lv-detail-avatar{display:grid;width:44px;height:44px;place-items:center;border-radius:13px;background:var(--soft);font-size:13px;font-weight:900}
        .lv-detail-label{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
        .lv-detail-name{margin:3px 0 0;font-size:18px;font-weight:900;letter-spacing:-.02em}
        .lv-detail-close{display:grid;width:34px;height:34px;place-items:center;border:1px solid var(--line);border-radius:10px;background:#fff;cursor:pointer}
        .lv-detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}
        .lv-detail-item{padding:12px;border-radius:13px;background:var(--soft)}
        .lv-detail-value{margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:800}
        .lv-detail-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;align-items:center}
        .lv-primary{display:inline-flex;align-items:center;gap:7px;min-height:38px;padding:0 12px;border-radius:10px;border:1px solid var(--ink);background:var(--ink);color:#fff;font-size:11px;font-weight:800}
        .lv-note{margin:12px 0 0;color:var(--muted);font-size:10px;line-height:1.6}
        @media(max-width:1100px){.lv-main{grid-template-columns:1fr}.lv-list{max-height:380px}.lv-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:720px){.lv-header{align-items:flex-start;flex-direction:column}.lv-actions{justify-content:flex-start}.lv-title{font-size:29px}.lv-stats{grid-template-columns:1fr 1fr}.lv-detail-grid{grid-template-columns:1fr 1fr}}
        @media(max-width:480px){.lv-stats{grid-template-columns:1fr}.lv-detail-grid{grid-template-columns:1fr}.lv-row{grid-template-columns:34px minmax(0,1fr)}.lv-row-meta{display:none}}
      `}</style>

      <div className="lv-header">
        <div>
          <div className="lv-kicker"><span className="lv-live-dot" />Live analytics</div>
          <h2 className="lv-title">Visitors right now</h2>
          <p className="lv-subtitle">See active storefront sessions on a real geographic map, inspect the current page and device, and jump directly to an exact location when a visitor has granted browser location access.</p>
        </div>
        <div className="lv-actions">
          <button type="button" className={`lv-btn ${autoRefresh ? 'active' : ''}`} onClick={() => setAutoRefresh(v => !v)}>{autoRefresh ? <Pause size={14} /> : <Play size={14} />}{autoRefresh ? 'Live updates' : 'Paused'}</button>
          <button type="button" className="lv-btn" onClick={load} disabled={loading}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      {error && <div className="lv-error">{error}</div>}

      <div className="lv-stats">
        <div className="lv-stat"><div className="lv-stat-top"><span>Live now</span><span className="lv-stat-icon"><Users size={16} /></span></div><div className="lv-stat-value">{visitors.length}</div><div className="lv-stat-hint">active storefront sessions</div></div>
        <div className="lv-stat"><div className="lv-stat-top"><span>Precise pins</span><span className="lv-stat-icon"><LocateFixed size={16} /></span></div><div className="lv-stat-value">{precise}</div><div className="lv-stat-hint">explicit visitor consent</div></div>
        <div className="lv-stat"><div className="lv-stat-top"><span>Locations</span><span className="lv-stat-icon"><Globe2 size={16} /></span></div><div className="lv-stat-value">{countries}</div><div className="lv-stat-hint">countries / regions</div></div>
        <div className="lv-stat"><div className="lv-stat-top"><span>Last update</span><span className="lv-stat-icon"><Activity size={16} /></span></div><div className="lv-stat-value" style={{ fontSize: 19, paddingTop: 5 }}>{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</div><div className="lv-stat-hint">{autoRefresh ? 'refreshes every 15 seconds' : 'automatic updates paused'}</div></div>
      </div>

      <div className="lv-main">
        <MapPanel visitors={visitors} selectedId={selectedId} onSelect={handleSelect} />
        <aside className="lv-side">
          <div className="lv-side-head">
            <div className="lv-side-title"><h3>Active sessions</h3><span className="lv-side-count">{filtered.length}</span></div>
            <div className="lv-search"><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search visitor, page or location" /></div>
          </div>
          <div className="lv-list">
            {filtered.length === 0 ? (
              <div className="lv-empty"><Users size={25} style={{ opacity: .35 }} /><div style={{ marginTop: 9, color: 'var(--ink)', fontWeight: 900 }}>{visitors.length ? 'No matching visitors' : 'No active visitors'}</div><div style={{ marginTop: 5 }}>{visitors.length ? 'Try another search.' : 'Open the storefront from another browser or device to test live tracking.'}</div></div>
            ) : filtered.map(visitor => {
              const exact = Number.isFinite(visitor.latitude) && Number.isFinite(visitor.longitude)
              return <button key={visitor.sessionId} type="button" className={`lv-row ${selectedId === visitor.sessionId ? 'selected' : ''}`} onClick={() => setSelectedId(visitor.sessionId === selectedId ? null : visitor.sessionId)}><span className="lv-avatar">{initials(visitor)}</span><span className="lv-row-main"><span className="lv-row-top"><span className="lv-row-status" /><span className="lv-row-name">{visitor.name || 'Anonymous visitor'}</span></span><span className="lv-row-page">{visitor.path || '/'}</span><span className="lv-row-location"><MapPin size={12} /><span>{locationLabel(visitor)}</span></span></span><span className="lv-row-meta"><span className="lv-badge">{exact ? <Navigation size={10} /> : <MapPin size={10} />}{exact ? 'Precise' : 'Approx.'}</span><span className="inline"><DeviceIcon device={visitor.device} /> {relativeTime(visitor.lastSeenAt)}</span></span></button>
            })}
          </div>
        </aside>
      </div>

      {selected && (
        <div className="lv-detail">
          <div className="lv-detail-head"><div className="lv-detail-person"><div className="lv-detail-avatar">{initials(selected)}</div><div><div className="lv-detail-label">Selected visitor</div><div className="lv-detail-name">{selected.name || 'Anonymous visitor'}</div></div></div><button type="button" className="lv-detail-close" onClick={() => setSelectedId(null)} aria-label="Close visitor details"><X size={16} /></button></div>
          <div className="lv-detail-grid"><div className="lv-detail-item"><div className="lv-detail-label">Current page</div><div className="lv-detail-value" title={selected.path}>{selected.path}</div></div><div className="lv-detail-item"><div className="lv-detail-label">Location</div><div className="lv-detail-value" title={locationLabel(selected)}>{locationLabel(selected)}</div></div><div className="lv-detail-item"><div className="lv-detail-label">Device</div><div className="lv-detail-value">{[selected.device, selected.browser, selected.os].filter(Boolean).join(' · ') || 'Unknown device'}</div></div><div className="lv-detail-item"><div className="lv-detail-label">First seen</div><div className="lv-detail-value">{new Date(selected.firstSeenAt).toLocaleTimeString()}</div></div></div>
          {Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude) && <div className="lv-detail-actions"><a className="lv-primary" href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open exact location</a><span className="lv-badge"><LocateFixed size={11} /> Browser location consented</span></div>}
          <p className="lv-note">Precise coordinates are shown only after explicit browser permission. Without that permission, the session can still appear here using the approximate location information available to the application.</p>
        </div>
      )}
    </section>
  )
}
