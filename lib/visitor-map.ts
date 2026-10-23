// The live map on Admin > Live visitors (components/visitors-map.tsx): rules that need no map library.
//
// Two kinds of dots, never mixed up:
//  - a visitor browsing: where their NETWORK says they are, rounded to one decimal (about 10 km). It is
//    a city-sized dot, not a street, and the map says "approximate".
//  - an unfinished checkout: the exact spot the shopper chose to share at checkout ("Share my exact
//    location"). Only these are exact.

// One decimal of a degree: about 11 km north-south. Coarser than a city on purpose.
const ROUND = 10

// A usable rounded place from anything Cloudflare or a saved row might hold; null when it is missing
// or not a real position ((0, 0) is the "unknown" value some networks give).
export function roundPlace(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = typeof lat === 'number' ? lat : typeof lat === 'string' && lat.trim() !== '' ? Number(lat) : NaN
  const b = typeof lng === 'number' ? lng : typeof lng === 'string' && lng.trim() !== '' ? Number(lng) : NaN
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null
  if (a === 0 && b === 0) return null
  return { lat: Math.round(a * ROUND) / ROUND, lng: Math.round(b * ROUND) / ROUND }
}

export type Dot = { lat: number; lng: number; label: string }
export type DotGroup = { lat: number; lng: number; count: number; labels: string[] }

// Visitors at the same rounded place become one dot with a number (everyone in Beirut is one dot).
export function groupDots(dots: Dot[], maxLabels = 5): DotGroup[] {
  const map = new Map<string, DotGroup>()
  for (const dot of dots) {
    const key = `${dot.lat}|${dot.lng}`
    const group = map.get(key) || { lat: dot.lat, lng: dot.lng, count: 0, labels: [] }
    group.count += 1
    if (group.labels.length < maxLabels) group.labels.push(dot.label)
    map.set(key, group)
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.lat - b.lat || a.lng - b.lng)
}

// Where the map starts when nobody is on it yet: the store's own country (Lebanon unless changed).
export const DEFAULT_MAP_VIEW: { lat: number; lng: number; zoom: number } = { lat: 33.9, lng: 35.9, zoom: 8 }
