// Server errors the store answers with, counted by the Worker itself (worker.ts) in a small file in the media
// bucket, so the count survives a database that is itself failing. Five within ten minutes tell the owner
// (app/api/internal/server-errors, lib/order-alerts.ts alertServerErrors), at most once every 6 hours.
//
// Counted: 500 and up from any page or API. Not counted: 503 (the maintenance page and the closed store's API
// answer it on purpose), the store's own scheduled jobs (they report their failures themselves), and the image
// proxy's 502/504 (an outside image host failing).
// Requests Cloudflare stops or that crash the Worker are counted by the store error check
// (.github/workflows/store-errors.yml). Docs: docs/server-error-alerts-2026-11.md.
export const SERVER_ERRORS_KEY = 'ops/server-errors.json'
export const SERVER_ERROR_WINDOW_MS = 10 * 60_000
export const SERVER_ERROR_THRESHOLD = 5
export const SERVER_ERROR_ALERT_EVERY_MS = 6 * 60 * 60_000
const MAX_PATHS = 10

export type ServerErrorState = {
  windowStart: number
  count: number
  paths: Record<string, number>
  statuses: Record<string, number>
  // When the owner was last told, and when telling them was last tried (a failed try is retried once the
  // window has passed, so an outage cannot make every error call the store again).
  alertedAt: number | null
  triedAt: number | null
}

export function countsAsServerError(status: number, pathname: string, internalJob: boolean) {
  if (status < 500 || status === 503 || internalJob || pathname.startsWith('/api/internal/')) return false
  // The image proxy answers 502 or 504 when an outside image host fails: a broken outside image, not the store.
  if (pathname.startsWith('/api/image-proxy') && status !== 500) return false
  return true
}

const counts = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n > 0).slice(0, 50)) as Record<string, number>
}
const time = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

export function parseServerErrors(text: string | null | undefined): ServerErrorState | null {
  try {
    const raw = JSON.parse(String(text ?? ''))
    if (!raw || typeof raw !== 'object' || typeof raw.windowStart !== 'number' || typeof raw.count !== 'number') return null
    return { windowStart: raw.windowStart, count: Math.max(0, Math.floor(raw.count)), paths: counts(raw.paths), statuses: counts(raw.statuses), alertedAt: time(raw.alertedAt), triedAt: time(raw.triedAt) }
  } catch {
    return null
  }
}

// One more error in the window (a new window once the last one is over). `alert` when the window has reached
// the threshold, nobody was told in the last 6 hours, and no try is under way in this window.
export function noteServerError(state: ServerErrorState | null, now: number, path: string, status: number): { state: ServerErrorState; alert: boolean } {
  const fresh = !state || now - state.windowStart >= SERVER_ERROR_WINDOW_MS || now < state.windowStart
  const base: ServerErrorState = fresh
    ? { windowStart: now, count: 0, paths: {}, statuses: {}, alertedAt: state?.alertedAt ?? null, triedAt: state?.triedAt ?? null }
    : state
  const key = (path || '/').slice(0, 120)
  // The page that just failed always stays, with the others that failed most: a page that is failing now must
  // not be left out because ten others failed once each before it.
  const merged: Record<string, number> = { ...base.paths, [key]: (base.paths[key] || 0) + 1 }
  const others = Object.entries(merged).filter(([p]) => p !== key).sort((a, b) => b[1] - a[1]).slice(0, MAX_PATHS - 1)
  const paths = Object.fromEntries([...others, [key, merged[key]] as [string, number]].sort((a, b) => b[1] - a[1]))
  const statuses = { ...base.statuses, [String(status)]: (base.statuses[String(status)] || 0) + 1 }
  const count = base.count + 1
  const quiet = !base.alertedAt || now - base.alertedAt >= SERVER_ERROR_ALERT_EVERY_MS
  const notTrying = !base.triedAt || now - base.triedAt >= SERVER_ERROR_WINDOW_MS
  const alert = count >= SERVER_ERROR_THRESHOLD && quiet && notTrying
  return { state: { ...base, count, paths, statuses, triedAt: alert ? now : base.triedAt }, alert }
}

// What the owner reads, e.g. "7 requests failed with a server error in 10 minutes: /shop (5), /api/products (2).
// Errors: 500 ×6, 502 ×1."
export function serverErrorSummary(state: Pick<ServerErrorState, 'count' | 'paths' | 'statuses'>) {
  const minutes = Math.round(SERVER_ERROR_WINDOW_MS / 60_000)
  const paths = Object.entries(state.paths).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, n]) => `${p} (${n})`).join(', ')
  const statuses = Object.entries(state.statuses).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ×${n}`).join(', ')
  return `${state.count} request${state.count === 1 ? '' : 's'} failed with a server error in ${minutes} minutes${paths ? `: ${paths}` : ''}.${statuses ? ` Errors: ${statuses}.` : ''}`
}
