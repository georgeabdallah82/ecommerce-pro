import { after } from 'next/server'

// Emails, push alerts and outgoing webhooks run after the response is sent. On Cloudflare
// Workers a promise nobody waits for can be cancelled as soon as the response goes out, so
// a bare `void sendEmail()` could silently never send. after() hands the promise to the
// platform's waitUntil (OpenNext wires this up), keeping the Worker alive until it settles.
// Callers attach their own .catch, so `task` never rejects.
export function runInBackground(task: Promise<unknown>) {
  try {
    after(task)
  } catch {
    // Outside a request (tests, scripts) there is nothing to extend; the promise still runs.
  }
}
