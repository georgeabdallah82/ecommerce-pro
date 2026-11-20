// The three hourly jobs -- the refund check (app/api/internal/reconcile-refunds), the release of abandoned card
// checkouts (app/api/internal/release-expired-reservations) and the retries (app/api/internal/retry-outbox) -- each
// wake the database. They used to run at the top of every hour: 24 wake-ups a day, about two hours of database time,
// mostly with nothing to do. Now they run at the top of the hour only while there is work, and every 6 hours whatever
// the marker says, in case something was left without saying so.
//
// "There is work" is a tiny marker in the media bucket, like the order watch's (lib/order-watch.ts): a failed message
// kept for another try (lib/outbox.ts) or a card checkout (app/api/checkout) sets it; after the jobs have run,
// app/api/internal/hourly-idle clears it when nothing is left -- no retry waiting, no card checkout awaiting payment,
// no refund awaiting the payment gateway. A refund sent to the gateway does not set it: the 6-hourly run picks it up.
// No database code here: worker.ts reads the marker before deciding whether to wake the database at all.
export const HOURLY_JOBS_KEY = 'ops/hourly-jobs.json'
export const HOURLY_SAFETY_EVERY_HOURS = 6

export type HourlyJobsMarker = { armed: boolean; at: number }

export function parseHourlyJobs(raw: unknown): HourlyJobsMarker | null {
  let value: any = raw
  if (typeof raw === 'string') { try { value = JSON.parse(raw) } catch { return null } }
  if (!value || typeof value !== 'object' || typeof value.armed !== 'boolean') return null
  const at = Number(value.at)
  return { armed: value.armed, at: Number.isFinite(at) ? at : 0 }
}

// For a top-of-the-hour run: with no marker yet (or an unreadable one) the jobs run, and their idle check writes one.
export function hourlyJobsDue(scheduledTime: number, marker: HourlyJobsMarker | null): boolean {
  if (!marker || marker.armed) return true
  return new Date(scheduledTime).getUTCHours() % HOURLY_SAFETY_EVERY_HOURS === 0
}
