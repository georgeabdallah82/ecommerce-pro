// Reads that the host stopped before the app could answer are tried again (docs/admin-load-errors-2026-11.md).
// Cloudflare ends a request that goes over the Worker's limits ("exceededResources", error 1102) and answers with its
// own error page instead of the app's JSON. In the 72 hours before this change that was 466 of 7,733 requests (6%),
// each stopped after about 10 ms of CPU: "Unable to load your library" in Add media, "Could not load sales channels"
// on Operations. A later try usually goes through. Only reads (GET) are repeated: a save is never sent twice.
const DELAYS_MS = [400, 1200]

// The app answers its own errors with JSON; a 5xx without it came from the host, not from the app.
export function stoppedByHost(response: Response) {
  if (response.status < 500) return false
  return !(response.headers.get('content-type') || '').includes('application/json')
}

export async function fetchRead(input: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return fetch(input, init)
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(input, init)
      if (!stoppedByHost(response) || attempt >= DELAYS_MS.length) return response
    } catch (error) {
      // The connection dropped: the same, a later try usually works.
      if (attempt >= DELAYS_MS.length) throw error
    }
    await new Promise(resolve => setTimeout(resolve, DELAYS_MS[attempt]))
  }
}
