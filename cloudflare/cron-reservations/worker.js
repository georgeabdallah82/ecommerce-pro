export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 })
    }

    return new Response('Method Not Allowed', { status: 405 })
  },

  async scheduled(controller, env, ctx) {
    const siteUrl = env.SITE_URL?.trim()
    const cronSecret = env.CRON_SECRET?.trim()

    if (!siteUrl) throw new Error('SITE_URL is required')
    if (!cronSecret) throw new Error('CRON_SECRET is required')

    const controllerAbort = new AbortController()
    const timeout = setTimeout(() => controllerAbort.abort(), 25000)

    ctx.waitUntil((async () => {
      try {
        const response = await fetch(new URL('/api/internal/release-expired-reservations', siteUrl), {
          method: 'GET',
          headers: {
            authorization: `Bearer ${cronSecret}`,
            'user-agent': 'ecommerce-pro-cloudflare-cron/1.0',
          },
          signal: controllerAbort.signal,
        })

        const body = await response.text()

        if (!response.ok) {
          throw new Error(`Reservation cleanup returned HTTP ${response.status}: ${body}`)
        }

        console.log(`Expired reservation cleanup completed: ${body}`)
      } finally {
        clearTimeout(timeout)
      }
    })())
  },
}
