export default async function handler() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.URL
  const cronSecret = process.env.CRON_SECRET

  if (!siteUrl) throw new Error('NEXT_PUBLIC_SITE_URL or URL must be configured for the scheduled reservation cleanup')
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
    return new Response(body, { status: 200 })
  } finally {
    clearTimeout(timeout)
  }
}

export const config = {
  schedule: '*/10 * * * *',
}
