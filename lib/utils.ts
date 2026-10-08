import { GENERIC_SERVER_ERROR, isInternalErrorMessage } from '@/lib/error-classify'
export { slugify } from '@/lib/slug'

// requireUser/requirePermission throw 'UNAUTHORIZED' / 'FORBIDDEN', and many routes pass any
// caught error's message straight into json({ error }, { status: 400 }). Normalising here gives
// every route the right status and a readable message for those two cases, in one place.
const AUTH_ERRORS: Record<string, { status: number; message: string }> = {
  UNAUTHORIZED: { status: 401, message: 'Please sign in to continue.' },
  FORBIDDEN: { status: 403, message: "You don't have permission to do that." },
}
export function json<T>(data: T, init?: ResponseInit) {
  const error = (data as { error?: unknown } | null)?.error
  const auth = typeof error === 'string' ? AUTH_ERRORS[error] : undefined
  if (auth) return Response.json({ ...(data as object), error: auth.message }, { ...init, status: auth.status })
  // Last line of defence: an error reply whose text looks like an internal failure (database,
  // network or code error) is logged here and replaced with a generic message and a 5xx status,
  // whichever route produced it.
  if (typeof error === 'string' && (init?.status ?? 200) >= 400 && isInternalErrorMessage(error)) {
    console.error('[api] internal error hidden from response:', error)
    return Response.json({ ...(data as object), error: GENERIC_SERVER_ERROR }, { ...init, status: (init?.status ?? 500) >= 500 ? init!.status : 500 })
  }
  return Response.json(data, init)
}

export function parseJson<T = unknown>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

export function clampInt(value: unknown, min: number, max: number, fallback = min) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

export function publicError(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Unexpected error'
}
