import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// The monthly backup restore check (docs/backup-restore-check-2026-11.md).
const workflow = readFileSync('.github/workflows/backup-restore-check.yml', 'utf8')

describe('the monthly backup restore check', () => {
  it('runs once a month and by hand, read-only, without the live database', () => {
    assert.match(workflow, /schedule:\n\s+- cron: "41 2 3 \* \*"/)
    assert.match(workflow, /workflow_dispatch:/)
    assert.match(workflow, /permissions:\n\s+contents: read/)
    assert.doesNotMatch(workflow, /NEON_DATABASE_URL|DATABASE_URL/)
  })
  it('downloads the newest nightly copy from R2, no older than two days', () => {
    assert.match(workflow, /BUCKET: ecommerce-pro-backups\n\s+MAX_AGE_DAYS: "2"/)
    assert.match(workflow, /name="yallahaul-\$\(date -u -d "-\$days days" \+%Y-%m-%d\)\.dump"/)
    assert.match(workflow, /r2 object get "\$BUCKET\/\$name" --file backup\.dump --remote/)
  })
  it('restores it into the PostgreSQL version it was made from, and checks what came back', () => {
    assert.match(workflow, /Dumped from database version: \\\(\[0-9\]\*\\\)/)
    assert.match(workflow, /docker run -d --name restoredb -e POSTGRES_PASSWORD=restore "postgres:\$major"/)
    for (const check of ['"$tables" -ge 50', '"$migrations" -ge 1', '"$settings" -ge 1', '"$staff" -ge 1']) assert.ok(workflow.includes(check), check)
    assert.match(workflow, /exit "\$bad"/)
  })
})
