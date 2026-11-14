import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fetchRead, stoppedByHost } from '@/lib/retry-fetch'

// Reads the host stopped before the app could answer (docs/admin-load-errors-2026-11.md).

const read = (path: string) => readFileSync(path, 'utf8')
const hostPage = () => new Response('<!DOCTYPE html><h1>Error 1102</h1>', { status: 503, headers: { 'content-type': 'text/html' } })
const json = (body: unknown, status = 200) => Response.json(body, { status })

async function withFetch(answers: Array<Response | Error>, run: (calls: { count: number }) => Promise<void>) {
  const original = globalThis.fetch
  const calls = { count: 0 }
  globalThis.fetch = (async () => {
    const answer = answers[Math.min(calls.count, answers.length - 1)]
    calls.count++
    if (answer instanceof Error) throw answer
    return answer.clone()
  }) as typeof fetch
  try { await run(calls) } finally { globalThis.fetch = original }
}

test('only a 5xx without the app\'s JSON counts as stopped by the host', () => {
  assert.equal(stoppedByHost(hostPage()), true)
  assert.equal(stoppedByHost(json({ error: 'Something went wrong on our side. Please try again.' }, 500)), false)
  assert.equal(stoppedByHost(json({ error: 'Forbidden' }, 403)), false)
  assert.equal(stoppedByHost(new Response('Not found', { status: 404 })), false)
})

test('a read the host stopped is tried again, and the app\'s answer comes back', async () => {
  await withFetch([hostPage(), json({ rows: [1] })], async calls => {
    const response = await fetchRead('/api/admin/media')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { rows: [1] })
    assert.equal(calls.count, 2)
  })
  // A dropped connection too.
  await withFetch([new TypeError('Failed to fetch'), json({ rows: [] })], async calls => {
    assert.equal((await fetchRead('/api/admin/media')).status, 200)
    assert.equal(calls.count, 2)
  })
})

test('it gives up after three tries, and leaves the app\'s own errors and saves alone', async () => {
  await withFetch([hostPage()], async calls => {
    assert.equal((await fetchRead('/api/admin/sales-channels')).status, 503)
    assert.equal(calls.count, 3)
  })
  await withFetch([json({ error: 'Forbidden' }, 403)], async calls => {
    assert.equal((await fetchRead('/api/admin/sales-channels')).status, 403)
    assert.equal(calls.count, 1)
  })
  await withFetch([hostPage(), json({ ok: true })], async calls => {
    assert.equal((await fetchRead('/api/admin/sales-channels', { method: 'POST', body: '{}' })).status, 503)
    assert.equal(calls.count, 1, 'a save is never sent twice')
  })
})

test('Add media: retried reads, the library\'s own error with Try again, a real dialog', () => {
  const picker = read('components/media-picker.tsx')
  assert.match(picker, /await fetchRead\(`\/api\/admin\/media\?\$\{params\}`, \{ cache: 'no-store' \}\)/)
  // The library's problems stay in the Library tab; it never claims an empty library it couldn't load.
  assert.match(picker, /\{tab === 'upload' && error && <div className=\{`\$\{ui\.alert\} \$\{ui\.alertDanger\}`\} role="alert">\{error\}<\/div>\}/)
  assert.match(picker, /\{tab === 'library' && libraryError && <div className=\{`\$\{ui\.alert\} \$\{ui\.alertDanger\}`\} role="alert">\{libraryError\} <button type="button" className=\{ui\.textButton\} onClick=\{\(\) => loadFirst\(q\.trim\(\)\)\}/)
  assert.match(picker, /<\/> : libraryError \? null : <div className=\{ui\.muted\}>/)
  assert.doesNotMatch(picker, /setError\(e instanceof Error \? e\.message : 'Unable to load your library'\)/)
  // A modal dialog named by its title, with a named Close.
  assert.match(picker, /useModalFocus\(dialog, open, onClose\)/)
  assert.match(picker, /role="dialog" aria-modal="true" aria-labelledby=\{titleId\} tabIndex=\{-1\}/)
  assert.match(picker, /<button type="button" className=\{ui\.iconBtn\} onClick=\{onClose\} aria-label="Close">/)
  // An upload the host stopped says it failed (it showed a JSON parse error).
  assert.match(picker, /const d = await r\.json\(\)\.catch\(\(\) => \(\{\}\)\)\n\s+if \(!r\.ok\) throw new Error\(d\.error \|\| 'Unable to upload image'\)/)
})

test('Operations: retried reads, and Try again beside the message', () => {
  const hub = read('components/admin-operations-hub.tsx')
  assert.match(hub, /const r = await fetchRead\(path, \{ \.\.\.init, headers:/)
  assert.match(hub, /setError\(failed\.length \? `Could not load \$\{failed\.join\(', '\)\}\.` : ''\)/)
  assert.match(hub, /role="alert">\{error\} <button type="button" className=\{ui\.textButton\} disabled=\{loading \|\| refreshing\} onClick=\{load\}>/)
})
