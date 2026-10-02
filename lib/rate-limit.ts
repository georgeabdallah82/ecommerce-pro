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

// Same contract as consumeRateLimit, but the count lives in the database so it holds across
// every Cloudflare Worker isolate (the in-memory map above starts empty in each one, which made
// login/reset-password limits easy to dodge). The in-memory check still runs first as a free
// fast path. If the database is unreachable the in-memory result stands rather than locking
// every customer out.
export async function consumeDurableRateLimit(key: string, limit: number, windowMs: number) {
  const local = consumeRateLimit(key, limit, windowMs)
  if (!local.allowed) return local
  try {
    const { db } = await import('@/lib/prisma')
    const now = new Date()
    const resetAt = new Date(now.getTime() + windowMs)
    let bucket = await db.rateLimitBucket.upsert({ where: { key }, create: { key, count: 1, resetAt }, update: { count: { increment: 1 } } })
    if (bucket.resetAt <= now) {
      // Window over: start a new one. The resetAt guard makes concurrent resets harmless.
      await db.rateLimitBucket.updateMany({ where: { key, resetAt: { lte: now } }, data: { count: 1, resetAt } })
      bucket = { ...bucket, count: 1, resetAt }
    }
    if (Math.random() < 0.01) await db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } })
    if (bucket.count > limit) return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1000)) }
    return { allowed: true, remaining: Math.max(0, limit - bucket.count), retryAfterSeconds: 0 }
  } catch (error) {
    console.error('[rate-limit] durable store unavailable, using in-memory limit', error)
    return local
  }
}

export async function clearDurableRateLimit(key: string) {
  clearRateLimit(key)
  try {
    const { db } = await import('@/lib/prisma')
    await db.rateLimitBucket.deleteMany({ where: { key } })
  } catch {}
}
