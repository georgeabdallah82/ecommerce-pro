'use client'

// Leaflet touches `window`/`document` as soon as it's imported, which crashes
// during server-side rendering. This file is only ever loaded via
// next/dynamic with ssr:false from live-visitors-admin.tsx, so it's safe to
// import at the top level here.
import { useEffect, useMemo, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { Crosshair, MapPin, Maximize2, Minus, Plus, Radio } from 'lucide-react'
import type { Map as LeafletMap, Marker } from 'leaflet'
import L from 'leaflet'
import styles from './admin-live-visitors.module.css'
import ui from './admin-ui.module.css'

export type Visitor = {
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

function locationLabel(v: Visitor) {
  return [v.city, v.region, v.country].filter(Boolean).join(', ') || 'Location unavailable'
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

export default function MapPanel({ visitors, selectedId, onSelect }: { visitors: Visitor[]; selectedId: string | null; onSelect: (id: string) => void }) {
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
