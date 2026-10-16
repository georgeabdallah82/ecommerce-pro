import { timingSafeEqual } from 'node:crypto'

// Requests the Worker's own cron sends to itself (worker.ts scheduled()): they carry a random key
// made for this Worker instance and kept only in its memory, so nothing outside can produce one
// and no secret has to be stored. A CRON_SECRET bearer (if one is configured) is accepted too, so
// a job can also be run by hand.
export const INTERNAL_JOB_HEADER = 'x-internal-job'
const KEY = Symbol.for('yallahaul.internalJobKey')

const same = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function isInternalJobRequest(req: Request) {
  const key = (globalThis as Record<symbol, unknown>)[KEY]
  const given = req.headers.get(INTERNAL_JOB_HEADER) || ''
  if (typeof key === 'string' && key.length >= 32 && given && same(given, key)) return true
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  return !!secret && !!auth && same(auth, `Bearer ${secret}`)
}
