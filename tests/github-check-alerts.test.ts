import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { POST } from '@/app/api/internal/github-check-failed/route'
import { ALERT_WORKFLOW, GITHUB_ALERT_AUDIENCE, GITHUB_CHECKS, GITHUB_ISSUER, failedCheck, verifyAlertToken } from '@/lib/github-check-alerts'
import { isBlockedDuringMaintenance } from '@/lib/maintenance-paths'

// A failed GitHub check reaches the owner's phone and email (docs/critical-paths-2026-11.md).
const read = (path: string) => readFileSync(path, 'utf8')
const b64url = (data: Uint8Array | string) => Buffer.from(data).toString('base64url')

// A key pair standing in for GitHub's: the public half is served as GitHub's keys, the private half signs tokens.
async function signer(kid = 'key-1') {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid }
  const sign = async (claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid }) => {
    const head = b64url(JSON.stringify(header)), body = b64url(JSON.stringify(claims))
    const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`)))
    return `${head}.${body}.${b64url(signature)}`
  }
  return { jwk, sign }
}

const NOW = 1_800_000_000_000
const REPO = 'georgeabdallah82/ecommerce-pro'
const CLAIMS = {
  iss: GITHUB_ISSUER, aud: GITHUB_ALERT_AUDIENCE, iat: NOW / 1000 - 5, nbf: NOW / 1000 - 5, exp: NOW / 1000 + 300,
  repository: REPO, ref: 'refs/heads/main', event_name: 'workflow_run',
  workflow_ref: `${REPO}/.github/workflows/${ALERT_WORKFLOW}@refs/heads/main`, run_id: '987', run_attempt: '1',
}

describe('a failed GitHub check tells the owner', () => {
  it('accepts a token GitHub signed for the alert workflow on main, and nothing else', async () => {
    const { jwk, sign } = await signer()
    const keys = async () => [jwk]
    const check = async (claims: Record<string, unknown>) => verifyAlertToken(await sign(claims), { now: NOW, keys })
    assert.equal(await check(CLAIMS), true)
    assert.equal(await check({ ...CLAIMS, aud: ['other', GITHUB_ALERT_AUDIENCE] }), true)
    const refused: Record<string, Record<string, unknown>> = {
      'another audience': { aud: 'sts.amazonaws.com' },
      'another issuer': { iss: 'https://example.com' },
      'an expired token': { exp: NOW / 1000 - 1 },
      'a token not valid yet': { nbf: NOW / 1000 + 600 },
      'another repository': { repository: 'someone/ecommerce-pro', workflow_ref: `someone/ecommerce-pro/.github/workflows/${ALERT_WORKFLOW}@refs/heads/main` },
      'another branch': { ref: 'refs/heads/feature', workflow_ref: `${REPO}/.github/workflows/${ALERT_WORKFLOW}@refs/heads/feature` },
      'a pull request': { event_name: 'pull_request', ref: 'refs/pull/1/merge' },
      'another workflow': { workflow_ref: `${REPO}/.github/workflows/ci.yml@refs/heads/main` },
      'the alert workflow from another branch': { workflow_ref: `${REPO}/.github/workflows/${ALERT_WORKFLOW}@refs/heads/feature` },
    }
    for (const [label, change] of Object.entries(refused)) assert.equal(await check({ ...CLAIMS, ...change }), false, label)
  })
  it('refuses a token that is not genuine', async () => {
    const { jwk, sign } = await signer()
    const other = await signer()
    const keys = async () => [jwk]
    const token = await sign(CLAIMS)
    const [head, , signature] = token.split('.')
    const forged = `${head}.${b64url(JSON.stringify({ ...CLAIMS, repository: 'x/y' }))}.${signature}`
    assert.equal(await verifyAlertToken(forged, { now: NOW, keys }), false, 'a changed body')
    assert.equal(await verifyAlertToken(await other.sign(CLAIMS), { now: NOW, keys }), false, 'another key with the same name')
    assert.equal(await verifyAlertToken(await sign(CLAIMS, { alg: 'RS256', kid: 'unknown' }), { now: NOW, keys }), false, 'a key GitHub does not have')
    assert.equal(await verifyAlertToken(await sign(CLAIMS, { alg: 'none', kid: 'key-1' }), { now: NOW, keys }), false, 'alg none')
    assert.equal(await verifyAlertToken(await sign(CLAIMS, { alg: 'HS256', kid: 'key-1' }), { now: NOW, keys }), false, 'alg HS256')
    for (const bad of ['', 'abc', 'a.b', `${token}.extra`, '!!!.???.***']) assert.equal(await verifyAlertToken(bad, { now: NOW, keys }), false, bad)
  })
  it('reads GitHub\'s keys again for a key it has not seen, so a key change does not stop the alerts', async () => {
    const { jwk, sign } = await signer('new-key')
    const reads: boolean[] = []
    const keys = async (fresh: boolean) => { reads.push(fresh); return fresh ? [jwk] : [] }
    assert.equal(await verifyAlertToken(await sign(CLAIMS), { now: NOW, keys }), true)
    assert.deepEqual(reads, [false, true])
  })
  it('names the failed check and its run, and nothing else', () => {
    assert.deepEqual(failedCheck({ check: 'neon-usage.yml', run: '123', attempt: '2' }), { file: 'neon-usage.yml', ...GITHUB_CHECKS['neon-usage.yml'], runUrl: `https://github.com/${REPO}/actions/runs/123`, runKey: '123:2' })
    assert.equal(failedCheck({ check: 'ci.yml', run: 5 })?.runKey, '5:1')
    for (const bad of [null, 'x', {}, { check: 'deploy.yml', run: '1' }, { check: 'toString', run: '1' }, { check: '__proto__', run: '1' }, { check: 'ci.yml', run: '1; rm' }, { check: 'ci.yml', run: '' }, { check: 'ci.yml', run: '1', attempt: 'x' }]) assert.equal(failedCheck(bad), null, JSON.stringify(bad))
  })
  it('the store\'s route refuses a request without a genuine token, and stays open while the store is closed', async () => {
    const send = (auth?: string) => POST(new Request('http://x/api/internal/github-check-failed', { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify({ check: 'ci.yml', run: '1' }) }))
    assert.equal((await send()).status, 401)
    assert.equal((await send('Bearer not-a-token')).status, 401)
    assert.equal(isBlockedDuringMaintenance('/api/internal/github-check-failed', 'POST'), false)
    const route = read('app/api/internal/github-check-failed/route.ts')
    assert.match(route, /consumeDurableRateLimit\(`github-check-run:\$\{run\.runKey\}`, 1, 24 \* 60 \* 60 \* 1000\)/)
    assert.match(route, /alertJobFailure\(`github:\$\{run\.file\}`, 0, `See the run: \$\{run\.runUrl\}`, \{ name: run\.name, body: run\.body \}\)/)
    assert.match(read('lib/order-alerts.ts'), /const body = about\?\.body \|\| `\$\{name\} failed/)
  })
  it('the alert workflow watches exactly these checks, on main, and sends GitHub\'s token for this store', () => {
    const workflow = read(`.github/workflows/${ALERT_WORKFLOW}`)
    const watched = (/workflows:\n((?:\s+- .+\n)+)/.exec(workflow)?.[1] || '').split('\n').map(line => line.replace(/^\s+- /, '').trim()).filter(Boolean)
    const names = Object.keys(GITHUB_CHECKS).map(file => /^name: (.+)$/m.exec(read(`.github/workflows/${file}`))?.[1])
    assert.deepEqual([...watched].sort(), [...names].sort())
    assert.match(workflow, /types: \[completed\]/)
    assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/)
    assert.match(workflow, /contains\(fromJSON\('\["failure", "timed_out", "startup_failure"\]'\), github\.event\.workflow_run\.conclusion\)/)
    assert.match(workflow, /permissions:\n\s+id-token: write/)
    assert.match(workflow, new RegExp(`audience=${GITHUB_ALERT_AUDIENCE}"`))
    assert.match(workflow, /\$STORE_URL\/api\/internal\/github-check-failed/)
    // The run's values reach the script as variables, never pasted into it.
    assert.doesNotMatch(workflow.split('run: |')[1], /\$\{\{/)
  })
})
