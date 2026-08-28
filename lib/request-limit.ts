type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 5000
let lastPruneAt = 0

function pruneExpired(now: number) {
  if (now - lastPruneAt < 60_000 && buckets.size <= MAX_BUCKETS) return
  lastPruneAt = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
  if (buckets.size <= MAX_BUCKETS) return
  const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
  for (let i = 0; i < oldest.length - MAX_BUCKETS; i += 1) buckets.delete(oldest[i][0])
}

export function clientKey(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const real = request.headers.get('x-real-ip')?.trim()
  return forwarded || real || 'unknown'
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  pruneExpired(now)
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { limited: false, retryAfterSeconds: Math.ceil(windowMs / 1000) }
  }
  if (current.count >= limit) {
    return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) }
  }
  current.count += 1
  return { limited: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) }
}
