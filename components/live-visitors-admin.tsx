'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { Globe2, Monitor, Smartphone, Tablet, RefreshCw, Users, MapPin, Clock3, ExternalLink, LocateFixed, Search, Pause, Play, X, Navigation, Maximize2, Minus, Plus, Activity, Crosshair, Radio, type LucideIcon } from 'lucide-react'
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
  if (device === 'mobile') return <Smartphone size={16} />
  if (device === 'tablet') return <Tablet size={16} />
  return <Monitor size={16} />
}

function locationLabel(v: Visitor) {
  return [v.city, v.region, v.country].filter(Boolean).join(', ') || 'Location unavailable'
}

function visitorInitials(v: Visitor) {
  const value = v.name?.trim() || 'Visitor'
  return value.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'V'
}

function createVisitorIcon(selected: boolean, precise: boolean) {
  const stateClass = selected ? 'is-selected' : precise ? 'is-precise' : 'is-approx'
  return L.divIcon({
    className: 'live-visitor-marker',
    html: `<span class="live-visitor-pin ${stateClass}"><span class="live-visitor-pulse"></span><span class="live-visitor-dot"></span></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

function MapPanel({ visitors, selectedId, onSelect }: { visitors: Visitor[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const mapElement = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markersRef = useRef<Map<string, Marker>>(new Map())
  const [mapReady, setMapReady] = useState(false)
  const located = useMemo(() => visitors.filter(v => Number.isFinite(v.latitude) && Number.isFinite(v.longitude)), [visitors])

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return
    const map = L.map(mapElement.current, { zoomControl: false, attributionControl: true, worldCopyJump: true, minZoom: 2 }).setView([33.8938, 35.5018], 8)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    mapRef.current = map
    setMapReady(true)
    window.setTimeout(() => map.invalidateSize(), 50)
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
      const lat = visitor.latitude as number
      const lng = visitor.longitude as number
      const precise = Number.isFinite(visitor.latitude) && Number.isFinite(visitor.longitude)
      let marker = markersRef.current.get(visitor.sessionId)
      if (!marker) {
        marker = L.marker([lat, lng], { icon: createVisitorIcon(visitor.sessionId === selectedId, precise), keyboard: true, title: visitor.name || 'Anonymous visitor' }).addTo(map)
        marker.on('click', () => onSelect(visitor.sessionId))
        markersRef.current.set(visitor.sessionId, marker)
      } else {
        marker.setLatLng([lat, lng])
        marker.setIcon(createVisitorIcon(visitor.sessionId === selectedId, precise))
      }
      marker.bindTooltip(`<strong>${visitor.name || 'Anonymous visitor'}</strong><br>${locationLabel(visitor)}<br><span>${visitor.path}</span>`, { direction: 'top', offset: [0, -14], opacity: 0.96, className: 'live-visitor-tooltip' })
    })
  }, [located, mapReady, onSelect, selectedId])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const selected = located.find(v => v.sessionId === selectedId)
    if (!selected || selected.latitude === null || selected.longitude === null) return
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
    if (selected?.latitude !== null && selected?.longitude !== null) mapRef.current.flyTo([selected.latitude as number, selected.longitude as number], 15, { duration: 0.65 })
  }

  return (
    <div className="relative overflow-hidden rounded-[28px] border bg-card shadow-sm">
      <style jsx global>{`
        .live-visitor-marker { background: transparent !important; border: 0 !important; }
        .live-visitor-pin { position: relative; display: flex; width: 34px; height: 34px; align-items: center; justify-content: center; }
        .live-visitor-dot { position: relative; z-index: 2; display: block; width: 14px; height: 14px; border: 3px solid white; border-radius: 999px; background: rgb(16 185 129); box-shadow: 0 3px 12px rgba(15,23,42,.28); }
        .live-visitor-pulse { position: absolute; z-index: 1; width: 34px; height: 34px; border-radius: 999px; background: rgba(16,185,129,.18); animation: visitor-pulse 2s infinite; }
        .live-visitor-pin.is-selected .live-visitor-dot { background: hsl(var(--primary)); width: 18px; height: 18px; }
        .live-visitor-pin.is-selected .live-visitor-pulse { background: color-mix(in srgb, hsl(var(--primary)) 24%, transparent); animation-duration: 1.4s; }
        .live-visitor-pin.is-approx .live-visitor-dot { background: rgb(59 130 246); }
        .live-visitor-pin.is-approx .live-visitor-pulse { background: rgba(59,130,246,.18); }
        .live-visitor-tooltip { border: 1px solid hsl(var(--border)); border-radius: 12px; background: hsl(var(--background)); color: hsl(var(--foreground)); box-shadow: 0 12px 30px rgba(15,23,42,.16); padding: 8px 10px; }
        .leaflet-control-attribution { border-radius: 10px 0 0 0; font-size: 10px; }
        @keyframes visitor-pulse { 0% { transform: scale(.72); opacity: .9; } 70% { transform: scale(1.15); opacity: .08; } 100% { transform: scale(.72); opacity: .9; } }
      `}</style>
      <div ref={mapElement} className="h-[540px] w-full bg-muted/40" />
      <div className="pointer-events-none absolute inset-0 z-[500]">
        <div className="pointer-events-auto absolute left-4 top-4 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-2xl border bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur-xl">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
          <div className="text-xs font-semibold">Live visitor map</div>
          <div className="hidden text-[11px] text-muted-foreground sm:block">{located.length} precisely located</div>
        </div>
        <div className="pointer-events-auto absolute right-4 top-4 flex flex-col gap-2">
          <button type="button" onClick={fitAll} disabled={!located.length} className="grid h-10 w-10 place-items-center rounded-xl border bg-background/95 shadow-lg backdrop-blur-xl transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" title="Fit all visitors" aria-label="Fit all visitors"><Maximize2 size={16} /></button>
          <button type="button" onClick={centerSelected} disabled={!selectedId} className="grid h-10 w-10 place-items-center rounded-xl border bg-background/95 shadow-lg backdrop-blur-xl transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" title="Center selected visitor" aria-label="Center selected visitor"><Crosshair size={16} /></button>
          <div className="overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur-xl">
            <button type="button" onClick={() => mapRef.current?.zoomIn()} className="grid h-10 w-10 place-items-center transition hover:bg-muted" title="Zoom in"><Plus size={16} /></button>
            <div className="border-t" />
            <button type="button" onClick={() => mapRef.current?.zoomOut()} className="grid h-10 w-10 place-items-center transition hover:bg-muted" title="Zoom out"><Minus size={16} /></button>
          </div>
        </div>
        <div className="pointer-events-auto absolute bottom-4 left-4 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-2xl border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-xl">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium"><span className="h-2 w-2 rounded-full bg-emerald-500" />Precise</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium"><span className="h-2 w-2 rounded-full bg-blue-500" />Approximate</span>
          <span className="hidden border-l pl-2 text-[10px] text-muted-foreground md:inline">Precise pins require visitor permission</span>
        </div>
        {located.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="pointer-events-auto max-w-sm rounded-3xl border bg-background/96 p-6 text-center shadow-2xl backdrop-blur-xl">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><MapPin size={24} /></div>
              <h3 className="mt-4 text-base font-semibold">Waiting for precise locations</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Visitors can continue browsing normally. A pin appears here when a visitor explicitly allows precise browser location.</p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border bg-muted/60 px-3 py-1.5 text-[11px] font-medium"><Radio size={12} className="text-emerald-500" /> Listening live</div>
            </div>
          </div>
        )}
      </div>
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
      setVisitors(data.visitors || [])
      setLastUpdated(new Date())
      setSelectedId(current => current && (data.visitors || []).some((v: Visitor) => v.sessionId === current) ? current : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load live visitors')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(load, 15_000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, load])

  const countries = useMemo(() => new Set(visitors.map(v => v.country).filter(Boolean)).size, [visitors])
  const precise = useMemo(() => visitors.filter(v => Number.isFinite(v.latitude) && Number.isFinite(v.longitude)).length, [visitors])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return visitors
    return visitors.filter(v => [v.name, v.path, v.country, v.city, v.region, v.device, v.browser, v.os].filter(Boolean).some(value => String(value).toLowerCase().includes(q)))
  }, [query, visitors])
  const selected = visitors.find(v => v.sessionId === selectedId) || null

  const stats: Array<{ label: string; value: string | number; Icon: LucideIcon; hint: string; tone: string }> = [
    { label: 'Live now', value: visitors.length, Icon: Users, hint: 'active sessions', tone: 'text-emerald-600 bg-emerald-500/10' },
    { label: 'Precise pins', value: precise, Icon: LocateFixed, hint: 'visitor consent', tone: 'text-primary bg-primary/10' },
    { label: 'Locations', value: countries, Icon: Globe2, hint: 'countries / regions', tone: 'text-blue-600 bg-blue-500/10' },
    { label: 'Updated', value: lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—', Icon: Clock3, hint: autoRefresh ? 'refreshing every 15s' : 'updates paused', tone: 'text-violet-600 bg-violet-500/10' },
  ]

  return (
    <section className="mt-12 space-y-5">
      {error && <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}

      <div className="rounded-[30px] border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border bg-background px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 shadow-sm">
              <Activity size={12} /> Live analytics
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Visitors right now</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">See active storefront sessions on a real geographic map, inspect the current page and device, and jump directly to an exact location when a visitor has granted browser location access.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAutoRefresh(v => !v)} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium shadow-sm transition ${autoRefresh ? 'bg-background hover:bg-muted' : 'bg-muted'}`}>
              {autoRefresh ? <Pause size={15} /> : <Play size={15} />}{autoRefresh ? 'Pause live' : 'Resume live'}
            </button>
            <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-3.5 text-sm font-medium shadow-sm transition hover:bg-muted disabled:opacity-50">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(({ label, value, Icon, hint, tone }) => (
            <div key={label} className="rounded-2xl border bg-background/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-muted-foreground">{label}</span>
                <span className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}><Icon size={17} /></span>
              </div>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-2xl font-semibold tracking-tight">{value}</span>
                <span className="pb-0.5 text-[11px] text-muted-foreground">{hint}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <MapPanel visitors={visitors} selectedId={selectedId} onSelect={setSelectedId} />

      {selected && (
        <div className="rounded-[28px] border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">{visitorInitials(selected)}</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{selected.name || 'Anonymous visitor'}</h3>
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Live</span>
                  {Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude) && <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[10px] font-medium text-emerald-700"><Navigation size={11} /> Precise</span>}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">Session {selected.sessionId}</p>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-xl border hover:bg-muted" aria-label="Close visitor details"><X size={16} /></button>
            </div>
            <a href={Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude) ? `https://www.google.com/maps?q=${selected.latitude},${selected.longitude}` : undefined} target="_blank" rel="noreferrer" className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-sm font-medium transition ${Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude) ? 'bg-primary text-primary-foreground hover:opacity-90' : 'pointer-events-none bg-muted text-muted-foreground'}`}><ExternalLink size={15} /> Open in Maps</a>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border bg-background/70 p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Current page</div><div className="mt-2 truncate text-sm font-medium">{selected.path}</div></div>
            <div className="rounded-2xl border bg-background/70 p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Location</div><div className="mt-2 truncate text-sm font-medium">{locationLabel(selected)}</div></div>
            <div className="rounded-2xl border bg-background/70 p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Device</div><div className="mt-2 flex items-center gap-2 text-sm font-medium"><DeviceIcon device={selected.device} />{[selected.device, selected.browser, selected.os].filter(Boolean).join(' · ') || 'Unknown'}</div></div>
            <div className="rounded-2xl border bg-background/70 p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Activity</div><div className="mt-2 text-sm font-medium">Seen {relativeTime(selected.lastSeenAt)}</div></div>
          </div>
          {Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude) && <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="rounded-lg border px-2.5 py-1.5 font-mono">{selected.latitude?.toFixed(5)}, {selected.longitude?.toFixed(5)}</span><span>Coordinates are visible because this visitor granted precise browser location access.</span></div>}
        </div>
      )}

      <div className="overflow-hidden rounded-[28px] border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2"><h3 className="font-semibold">Active sessions</h3><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{filtered.length}</span></div>
            <p className="mt-1 text-xs text-muted-foreground">Selecting a visitor focuses the live map on their current position.</p>
          </div>
          <div className="relative w-full xl:w-80">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search visitor, page, city…" className="h-10 w-full rounded-xl border bg-background pl-9 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring" />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-14 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><Users size={24} /></div>
            <p className="mt-4 text-sm font-semibold">{visitors.length ? 'No matching sessions' : 'No active storefront visitors'}</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{visitors.length ? 'Try a different search.' : 'Open the storefront in another browser or device to see a live session appear here.'}</p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map(visitor => {
              const preciseLocation = Number.isFinite(visitor.latitude) && Number.isFinite(visitor.longitude)
              const active = visitor.sessionId === selectedId
              return (
                <button key={visitor.sessionId} type="button" onClick={() => setSelectedId(active ? null : visitor.sessionId)} className={`grid w-full gap-4 px-5 py-4 text-left transition sm:px-6 md:grid-cols-[1.35fr_1.2fr_1fr_auto] md:items-center ${active ? 'bg-primary/[0.04]' : 'hover:bg-muted/50'}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-xs font-semibold">{visitorInitials(visitor)}</div>
                    <div className="min-w-0"><div className="flex items-center gap-2 text-sm font-medium"><span className={`h-2 w-2 rounded-full ${preciseLocation ? 'bg-emerald-500' : 'bg-blue-500'}`} />{visitor.name || 'Anonymous visitor'}</div><div className="mt-1 truncate text-xs text-muted-foreground">{visitor.path}</div></div>
                  </div>
                  <div className="flex min-w-0 items-center gap-2 text-sm"><MapPin size={15} className="shrink-0 text-muted-foreground" /><span className="truncate">{locationLabel(visitor)}</span><span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] text-muted-foreground">{preciseLocation ? 'precise' : 'approx.'}</span></div>
                  <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"><DeviceIcon device={visitor.device} /><span className="truncate">{[visitor.browser, visitor.os].filter(Boolean).join(' · ') || 'Unknown device'}</span></div>
                  <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground"><span>{relativeTime(visitor.lastSeenAt)}</span><ChevronIndicator active={active} /></div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border bg-muted/30 px-4 py-3 text-[11px] leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-2"><LocateFixed size={13} /> Precise coordinates are collected only after explicit browser permission.</span>
        <span>Inactive sessions automatically disappear after 90 seconds.</span>
      </div>
    </section>
  )
}

function ChevronIndicator({ active }: { active: boolean }) {
  return <span className={`grid h-7 w-7 place-items-center rounded-lg border transition-transform ${active ? 'rotate-180 bg-primary/10 text-primary' : 'text-muted-foreground'}`}><Navigation size={12} /></span>
}
