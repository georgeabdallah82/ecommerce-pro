import { getMediaBucket } from '@/lib/media-storage'
import { HOURLY_JOBS_KEY, parseHourlyJobs } from '@/lib/hourly-jobs'

// The marker (lib/hourly-jobs.ts). Best effort: a missing bucket (local development) or a failed write never affects
// what set it -- the 6-hourly run still does the work.
const json = { httpMetadata: { contentType: 'application/json' } }

export async function armHourlyJobs(now = Date.now()) {
  try {
    const bucket = await getMediaBucket()
    if (bucket) await bucket.put(HOURLY_JOBS_KEY, JSON.stringify({ armed: true, at: now }), json)
  } catch (error) {
    console.error('[hourly-jobs] could not set the marker', error)
  }
}

// Read before counting the work, then cleared only if nobody set it in between (the etag still matches): work queued
// during the count keeps the jobs running.
export async function readHourlyJobsMarker(): Promise<{ armed: boolean | null; etag: string | null }> {
  const bucket = await getMediaBucket()
  if (!bucket) return { armed: null, etag: null }
  const object = await bucket.get(HOURLY_JOBS_KEY)
  if (!object) return { armed: null, etag: null }
  return { armed: parseHourlyJobs(await object.text())?.armed ?? null, etag: object.etag || null }
}

export async function setHourlyJobsIdle(etag: string | null, now = Date.now()): Promise<boolean> {
  const bucket = await getMediaBucket()
  if (!bucket) return false
  const written = await bucket.put(HOURLY_JOBS_KEY, JSON.stringify({ armed: false, at: now }), etag ? { ...json, onlyIf: { etagMatches: etag } } : json)
  return written !== null
}
