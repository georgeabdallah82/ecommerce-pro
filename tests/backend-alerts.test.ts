import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { POST } from '@/app/api/internal/job-failed/route'
import { SCHEDULED_JOBS } from '@/lib/order-alerts'

// Alerts: failed scheduled jobs and failed store requests (docs/backend-alerts-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')

describe('a scheduled job that fails tells the owner', () => {
  it('the Worker reports every failed job, after the job and without stopping the others', () => {
    const worker = read('worker.ts')
    assert.match(worker, /if \(response\.ok\) continue\n\s+if \(!failure\) failure = new Error[^\n]*\n\s+await reportJobFailure\(site, path, response\.status, body, env, ctx\)/)
    assert.match(worker, /new Request\(`\$\{site\}\/api\/internal\/job-failed`, \{ method: 'POST', headers: \{ 'x-internal-job': internalJobKey\(\)/)
  })
  it('names every job the Worker runs', () => {
    const worker = read('worker.ts')
    for (const path of worker.match(/'\/api\/internal\/[a-z-]+'/g) || []) {
      const job = path.slice(1, -1)
      if (job !== '/api/internal/job-failed') assert.ok(Object.prototype.hasOwnProperty.call(SCHEDULED_JOBS, job), job)
    }
  })
  it('logs each failure, and alerts at most once per job every 6 hours, only with order-problem alerts on', () => {
    const alerts = read('lib/order-alerts.ts')
    assert.match(alerts, /await audit\(null, 'job\.failed', 'Job', path, \{ status, detail \}\)/)
    assert.match(alerts, /if \(!\(await orderProblemAlertsOn\(\)\)\) return false\n\s+const gate = await consumeDurableRateLimit\(`alert:job:\$\{path\}`, 1, JOB_ALERT_WINDOW_MS\)/)
    assert.match(alerts, /export const JOB_ALERT_WINDOW_MS = 6 \* 60 \* 60 \* 1000/)
  })
  it('the report route takes only the Worker\'s key or the bearer, and only the store\'s own jobs', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'
    const send = (body: unknown, auth?: string) => POST(new Request('http://x/api/internal/job-failed', { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) }))
    assert.equal((await send({ path: '/api/internal/daily', status: 500 })).status, 401)
    assert.equal((await send({ path: '/api/internal/daily', status: 500 }, 'Bearer wrong')).status, 401)
    assert.equal((await send({ path: '/api/somewhere-else', status: 500 }, 'Bearer test-cron-secret')).status, 400)
    assert.equal((await send({ path: 'toString', status: 500 }, 'Bearer test-cron-secret')).status, 400)
  })
})

describe('failed store requests are checked every 6 hours', () => {
  const workflow = read('.github/workflows/store-errors.yml')
  it('runs on a schedule, read-only', () => {
    assert.match(workflow, /schedule:\n\s+- cron: "23 \*\/6 \* \* \*"/)
    assert.match(workflow, /permissions:\n\s+contents: read/)
  })
  it('fails the run (GitHub emails the owner) above 2% and at least 25 failed requests', () => {
    assert.match(workflow, /MAX_PERCENT: "2"\n\s+MIN_FAILED: "25"/)
    assert.match(workflow, /select\(\.status != "success" and \.status != "clientDisconnected"\)/)
    assert.match(workflow, /if \[ "\$failed" -ge "\$MIN_FAILED" \] && jq -e -n [^\n]*'\$p > \$max'[^\n]*; then\n[^\n]*\n\s+exit 1/)
  })
})
