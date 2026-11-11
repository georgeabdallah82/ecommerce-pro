import { json } from '@/lib/utils'
import { GENERIC_SERVER_ERROR, isInternalError, isUniqueConflict } from '@/lib/error-classify'
import { UserError } from '@/lib/user-error'

// The reply for an error caught in an API route (audit HI-02/HI-04):
//  - sign-in / permission errors → 401 / 403 (json() maps them),
//  - a malformed request body or failed validation → 400 with a plain message,
//  - a duplicate value → 409,
//  - messages the route threw for the user ("SKU is required") → `status` with that message,
//  - anything else (database, network, code errors) → logged, 500, generic message.
export function routeError(e: unknown, fallback: string, status = 400) {
  if (e instanceof Error && (e.message === 'UNAUTHORIZED' || e.message === 'FORBIDDEN')) return json({ error: e.message }, { status })
  // Written for the user (lib/user-error.ts): sent as it is, with the status the error carries.
  if (e instanceof UserError) return json({ error: e.message }, { status: e.status })
  if (e instanceof SyntaxError) return json({ error: 'The request was not valid. Please try again.' }, { status: 400 })
  if (e instanceof Error && e.name === 'ZodError') return json({ error: 'Please check the details and try again.' }, { status: 400 })
  if (isUniqueConflict(e)) return json({ error: 'That value is already used by another record.' }, { status: 409 })
  if (isInternalError(e)) {
    console.error(`[api] ${fallback}:`, e)
    return json({ error: status >= 500 ? fallback : GENERIC_SERVER_ERROR }, { status: 500 })
  }
  return json({ error: (e as Error).message || fallback }, { status })
}
