// Cloudflare Worker equivalent of the old netlify/functions/release-expired-reservations.mjs
// Scheduled Function. Cloudflare has no built-in scheduled-task support inside the main
// opennextjs-cloudflare app worker, so this is deployed as its own small Worker with a Cron
// Trigger (see wrangler.jsonc) that calls the app's internal cleanup endpoint over HTTPS.
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(releaseExpiredReservations(env))
  },
}

async function releaseExpiredReservations(env) {
  const siteUrl = env.SITE_URL
  const cronSecret = env.CRON_SECRET

  if (!siteUrl) throw new Error('SITE_URL must be configured for the scheduled reservation cleanup')
  if (!cronSecret) throw new Error('CRON_SECRET must be configured for the scheduled reservation cleanup')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25000)

  try {
    const response = await fetch(new URL('/api/internal/release-expired-reservations', siteUrl), {
      method: 'GET',
      headers: {
        authorization: `Bearer ${cronSecret}`,
        'user-agent': 'ecommerce-pro-reservation-cleanup/1.0',
      },
      signal: controller.signal,
    })

    const body = await response.text()

    if (!response.ok) {
      throw new Error(`Reservation cleanup returned HTTP ${response.status}: ${body}`)
    }

    console.log(`Expired reservation cleanup completed: ${body}`)
  } finally {
    clearTimeout(timeout)
  }
}
