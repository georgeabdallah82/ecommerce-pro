type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 10_000

function prune(now: number) {
  if (buckets.size <= MAX_BUCKETS) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
    if (buckets.size <= MAX_BUCKETS) break
  }
  if (buckets.size > MAX_BUCKETS) {
    const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt).slice(0, Math.ceil(buckets.size / 10))
    for (const [key] of oldest) buckets.delete(key)
  }
}

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  prune(now)
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 }
  }
  current.count += 1
  if (current.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) }
  }
  return { allowed: true, remaining: Math.max(0, limit - current.count), retryAfterSeconds: 0 }
}

export function clearRateLimit(key: string) {
  buckets.delete(key)
}
