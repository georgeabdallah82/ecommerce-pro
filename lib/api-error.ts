import { json } from '@/lib/utils'
import { GENERIC_SERVER_ERROR, isUniqueConflict } from '@/lib/error-classify'
import { UserError } from '@/lib/user-error'

// The reply for an error caught in an API route:
//  - sign-in / permission errors → 401 / 403 (json() maps them),
//  - a message written for the person (a UserError, lib/user-error.ts) → its text, with the status it
//    carries or else the route's status,
//  - a malformed request body or failed validation → 400 with a plain message,
//  - a duplicate value → 409,
//  - anything else (a plain Error: a database, network, provider or code error, or a message nobody
//    marked for the person) → logged, 500, and the route's generic line. Its text never reaches the browser.
// `headers` is for a route whose replies carry headers, such as Cache-Control.
export function routeError(e: unknown, fallback: string, status = 400, headers?: HeadersInit) {
  const init = (s: number): ResponseInit => (headers ? { status: s, headers } : { status: s })
  if (e instanceof Error && (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN')) return json({ error: e.message }, init(status))
  if (e instanceof UserError) return json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, init(e.status ?? status))
  // A write that must run as one transaction could not run, so none of it was kept (lib/prisma.ts): ask for a retry.
  if (e instanceof Error && e.name === 'TransactionUnavailableError') return json({ error: e.message }, init(503))
  if (e instanceof SyntaxError) return json({ error: 'The request was not valid. Please try again.' }, init(400))
  if (e instanceof Error && e.name === 'ZodError') return json({ error: 'Please check the details and try again.' }, init(400))
  if (isUniqueConflict(e)) return json({ error: 'That value is already used by another record.' }, init(409))
  console.error(`[api] ${fallback}:`, e)
  return json({ error: status >= 500 ? fallback : GENERIC_SERVER_ERROR }, init(500))
}
