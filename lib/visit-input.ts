// What a page sends to /api/analytics/visit, read defensively (pure: no database).
import { storedPath } from '@/lib/visitor-tracking'

export type VisitKind = 'view' | 'ping' | 'leave'
export type VisitInput = {
  kind: VisitKind
  path: string
  referrer: string | null
  landing: string | null
  cartItems: number
  cartValue: number
}

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const count = (value: unknown, max: number) => { const n = Math.floor(Number(value)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0 }

// Link tags that say where a visitor came from. Everything else in the address (which can carry
// personal details) is dropped on the visitor's own device and again here.
const SOURCE_TAGS = ['utm_source', 'utm_medium', 'fbclid', 'igshid', 'gclid', 'ttclid']
export function sourceTags(search: unknown) {
  const out = new URLSearchParams()
  try {
    const query = new URLSearchParams(String(search || '').replace(/^\?/, '').slice(0, 600))
    for (const key of SOURCE_TAGS) { const value = query.get(key); if (value !== null) out.set(key, value.slice(0, 40)) }
  } catch {}
  return out.toString()
}

// Reads the body the page sent; anything unexpected becomes a harmless default.
export function readVisit(body: any): VisitInput {
  const kind: VisitKind = body?.kind === 'ping' || body?.kind === 'leave' ? body.kind : 'view'
  const tags = sourceTags(body?.tags)
  return {
    kind,
    path: storedPath(body?.path),
    referrer: clean(body?.referrer, 300) || null,
    landing: tags ? `/?${tags}` : null,
    cartItems: count(body?.cartItems, 999),
    cartValue: count(body?.cartValue, 100_000_000),
  }
}

