export function slugify(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
}

export function json<T>(data: T, init?: ResponseInit) { return Response.json(data, init) }

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
