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
import styles from './admin-live-visitors.module.css'
import ui from './admin-ui.module.css'

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

// Built as a raw HTML string for Leaflet's L.divIcon (Leaflet owns this DOM,
// not React), so it references the same compiled `styles.*` class names the
// CSS module defines rather than literal strings - see the module file header.
function createVisitorIcon(selected: boolean) {
  const markerClass = `${styles.lvMarker}${selected ? ` ${styles.lvMarkerSelected}` : ''}`
  return L.divIcon({
    className: styles.lvMarkerHost,
    html: `<span class="${markerClass}"><span class="${styles.lvMarkerRing}"></span><span class="${styles.lvMarkerCore}"></span></span>`,
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
        className: styles.lvTooltip,
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
    <div className={styles.lvMapShell}>
      <div ref={mapElement} className={styles.lvMapCanvas} />

      <div className={`${styles.lvMapOverlay} ${styles.lvMapStatus}`}>
        <span className={styles.lvMapStatusDot} />
        <span>LIVE VISITOR MAP</span>
        <span style={{ color: 'var(--admin-muted)', fontWeight: 600 }}>{located.length} precise</span>
      </div>

      <div className={`${styles.lvMapOverlay} ${styles.lvMapControls}`}>
        <button type="button" className={styles.lvMapBtn} onClick={fitAll} disabled={!located.length} aria-label="Fit all visitors" title="Fit all visitors"><Maximize2 size={16} /></button>
        <button type="button" className={styles.lvMapBtn} onClick={centerSelected} disabled={!selectedId} aria-label="Center selected visitor" title="Center selected visitor"><Crosshair size={16} /></button>
        <button type="button" className={styles.lvMapBtn} onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in" title="Zoom in"><Plus size={16} /></button>
        <button type="button" className={styles.lvMapBtn} onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out" title="Zoom out"><Minus size={16} /></button>
      </div>

      <div className={`${styles.lvMapOverlay} ${styles.lvMapLegend}`}>
        <span className={styles.lvLegendItem}><span className={styles.lvLegendDot} />Precise</span>
        <span className={styles.lvLegendItem}><span className={`${styles.lvLegendDot} ${styles.lvLegendDotApprox}`} />Approximate</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>Browser consent required</span>
      </div>

      {mapError && <div className={styles.lvMapError}>Map tiles could not be loaded. Visitor session data is still live.</div>}

      {located.length === 0 && (
        <div className={styles.lvMapEmpty}>
          <div className={styles.lvMapEmptyCard}>
            <div style={{ width: 54, height: 54, margin: '0 auto', borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--admin-border-soft)' }}><MapPin size={24} /></div>
            <h3 style={{ margin: '16px 0 6px', fontSize: 18 }}>Waiting for live locations</h3>
            <p style={{ margin: 0, color: 'var(--admin-muted)', fontSize: 13, lineHeight: 1.65 }}>Visitors appear here when they explicitly allow precise browser location. Visitors who decline are still visible in the live session feed.</p>
            <div className={ui.pill} style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Radio size={12} /> Listening for visitors</div>
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
    <section className={styles.liveVisitors}>
      <div className={styles.lvHeader}>
        <div>
          <div className={styles.lvKicker}><span className={styles.lvLiveDot} />Live analytics</div>
          <h2 className={styles.lvTitle}>Visitors right now</h2>
          <p className={styles.lvSubtitle}>See active storefront sessions on a real geographic map, inspect the current page and device, and jump directly to an exact location when a visitor has granted browser location access.</p>
        </div>
        <div className={styles.lvActions}>
          <button type="button" className={`${styles.lvBtn}${autoRefresh ? ` ${styles.lvBtnActive}` : ''}`} onClick={() => setAutoRefresh(v => !v)}>
            {autoRefresh ? <Pause size={14} /> : <Play size={14} />}{autoRefresh ? 'Live updates' : 'Paused'}
          </button>
          <button type="button" className={styles.lvBtn} onClick={load} disabled={loading}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      {error && <div className={styles.lvError}>{error}</div>}

      <div className={styles.lvStats}>
        <div className={styles.lvStat}>
          <div className={styles.lvStatTop}><span>Live now</span><span className={styles.lvStatIcon}><Users size={16} /></span></div>
          <div className={styles.lvStatValue}>{visitors.length}</div>
          <div className={styles.lvStatHint}>active storefront sessions</div>
        </div>
        <div className={styles.lvStat}>
          <div className={styles.lvStatTop}><span>Precise pins</span><span className={styles.lvStatIcon}><LocateFixed size={16} /></span></div>
          <div className={styles.lvStatValue}>{precise}</div>
          <div className={styles.lvStatHint}>explicit visitor consent</div>
        </div>
        <div className={styles.lvStat}>
          <div className={styles.lvStatTop}><span>Locations</span><span className={styles.lvStatIcon}><Globe2 size={16} /></span></div>
          <div className={styles.lvStatValue}>{countries}</div>
          <div className={styles.lvStatHint}>countries / regions</div>
        </div>
        <div className={styles.lvStat}>
          <div className={styles.lvStatTop}><span>Last update</span><span className={styles.lvStatIcon}><Activity size={16} /></span></div>
          <div className={styles.lvStatValue} style={{ fontSize: 19, paddingTop: 5 }}>{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</div>
          <div className={styles.lvStatHint}>{autoRefresh ? 'refreshes every 15 seconds' : 'automatic updates paused'}</div>
        </div>
      </div>

      <div className={styles.lvMain}>
        <MapPanel visitors={visitors} selectedId={selectedId} onSelect={handleSelect} />
        <aside className={styles.lvSide}>
          <div className={styles.lvSideHead}>
            <div className={styles.lvSideTitle}><h3>Active sessions</h3><span className={styles.lvSideCount}>{filtered.length}</span></div>
            <div className={styles.lvSearch}>
              <Search size={15} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search visitor, page or location" />
            </div>
          </div>
          <div className={styles.lvList}>
            {filtered.length === 0 ? (
              <div className={styles.lvEmpty}>
                <Users size={25} style={{ opacity: .35 }} />
                <div style={{ marginTop: 9, color: 'var(--admin-ink)', fontWeight: 900 }}>{visitors.length ? 'No matching visitors' : 'No active visitors'}</div>
                <div style={{ marginTop: 5 }}>{visitors.length ? 'Try another search.' : 'Open the storefront from another browser or device to test live tracking.'}</div>
              </div>
            ) : filtered.map(visitor => {
              const exact = Number.isFinite(visitor.latitude) && Number.isFinite(visitor.longitude)
              return (
                <button
                  key={visitor.sessionId}
                  type="button"
                  className={`${styles.lvRow}${selectedId === visitor.sessionId ? ` ${styles.lvRowSelected}` : ''}`}
                  onClick={() => setSelectedId(visitor.sessionId === selectedId ? null : visitor.sessionId)}
                >
                  <span className={styles.lvAvatar}>{initials(visitor)}</span>
                  <span className={styles.lvRowMain}>
                    <span className={styles.lvRowTop}>
                      <span className={styles.lvRowStatus} />
                      <span className={styles.lvRowName}>{visitor.name || 'Anonymous visitor'}</span>
                    </span>
                    <span className={styles.lvRowPage}>{visitor.path || '/'}</span>
                    <span className={styles.lvRowLocation}><MapPin size={12} /><span>{locationLabel(visitor)}</span></span>
                  </span>
                  <span className={styles.lvRowMeta}>
                    <span className={styles.lvBadge}>{exact ? <Navigation size={10} /> : <MapPin size={10} />}{exact ? 'Precise' : 'Approx.'}</span>
                    <span className="inline"><DeviceIcon device={visitor.device} /> {relativeTime(visitor.lastSeenAt)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </aside>
      </div>

      {selected && (
        <div className={styles.lvDetail}>
          <div className={styles.lvDetailHead}>
            <div className={styles.lvDetailPerson}>
              <div className={styles.lvDetailAvatar}>{initials(selected)}</div>
              <div>
                <div className={styles.lvDetailLabel}>Selected visitor</div>
                <div className={styles.lvDetailName}>{selected.name || 'Anonymous visitor'}</div>
              </div>
            </div>
            <button type="button" className={styles.lvDetailClose} onClick={() => setSelectedId(null)} aria-label="Close visitor details"><X size={16} /></button>
          </div>
          <div className={styles.lvDetailGrid}>
            <div className={styles.lvDetailItem}><div className={styles.lvDetailLabel}>Current page</div><div className={styles.lvDetailValue} title={selected.path}>{selected.path}</div></div>
            <div className={styles.lvDetailItem}><div className={styles.lvDetailLabel}>Location</div><div className={styles.lvDetailValue} title={locationLabel(selected)}>{locationLabel(selected)}</div></div>
            <div className={styles.lvDetailItem}><div className={styles.lvDetailLabel}>Device</div><div className={styles.lvDetailValue}>{[selected.device, selected.browser, selected.os].filter(Boolean).join(' · ') || 'Unknown device'}</div></div>
            <div className={styles.lvDetailItem}><div className={styles.lvDetailLabel}>First seen</div><div className={styles.lvDetailValue}>{new Date(selected.firstSeenAt).toLocaleTimeString()}</div></div>
          </div>
          {Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude) && (
            <div className={styles.lvDetailActions}>
              <a className={styles.lvPrimary} href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open exact location</a>
              <span className={styles.lvBadge}><LocateFixed size={11} /> Browser location consented</span>
            </div>
          )}
          <p className={styles.lvNote}>Precise coordinates are shown only after explicit browser permission. Without that permission, the session can still appear here using the approximate location information available to the application.</p>
        </div>
      )}
    </section>
  )
}
