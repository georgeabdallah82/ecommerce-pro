import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
// @ts-expect-error plain JavaScript module (run by node in GitHub Actions)
import { CONFIRM_PHRASE, cleanBlockers, parseArgs, parseEmails, parseOrderNumbers } from '../scripts/launch-cleanup.mjs'

describe('launch clean-up', () => {
  it('reads the orders and customers to keep the way people type them', () => {
    assert.deepEqual(parseOrderNumbers('#1004, 1007\n1007 ord-mva1x6dz-p3a4'), ['1004', '1007', 'ORD-MVA1X6DZ-P3A4'])
    assert.deepEqual(parseOrderNumbers(''), [])
    assert.deepEqual(parseEmails(' Rana@Example.com; rana@example.com,  x@y.lb '), ['rana@example.com', 'x@y.lb'])
  })

  it('takes preview by default and refuses unknown options', () => {
    assert.equal(parseArgs([]).mode, 'preview')
    const args = parseArgs(['clean', '--confirm', CONFIRM_PHRASE, '--keep-orders', '1004', '--restore-stock'])
    assert.deepEqual({ mode: args.mode, confirm: args.confirm, keepOrders: args.keepOrders, restoreStock: args.restoreStock }, { mode: 'clean', confirm: 'DELETE TEST DATA', keepOrders: ['1004'], restoreStock: true })
    assert.throws(() => parseArgs(['wipe']), /preview" or "clean/)
    assert.throws(() => parseArgs(['clean', '--force']), /Unknown option/)
  })

  it('only cleans with the exact phrase, while the store is closed, and when everything to keep exists', () => {
    const fine = { mode: 'clean', confirm: CONFIRM_PHRASE, maintenanceOn: true, missingOrders: [], missingCustomers: [] }
    assert.deepEqual(cleanBlockers(fine), [])
    assert.deepEqual(cleanBlockers({ ...fine, mode: 'preview', confirm: '' }), [])
    assert.match(cleanBlockers({ ...fine, confirm: 'delete test data' }).join(), /confirmation exactly/)
    assert.match(cleanBlockers({ ...fine, maintenanceOn: false }).join(), /maintenance mode/)
    assert.match(cleanBlockers({ ...fine, missingOrders: ['9999'] }).join(), /do not exist: 9999/)
    assert.match(cleanBlockers({ ...fine, missingCustomers: ['a@b.c'] }).join(), /1 email address/)
  })

  it('deletes only from test-data tables, never products, settings or staff', () => {
    const source = readFileSync('scripts/launch-cleanup.mjs', 'utf8')
    const tables = new Set([...source.matchAll(/DELETE FROM "(\w+)"/g)].map(m => m[1]))
    for (const name of source.match(/for \(const table of \[([^\]]+)\]/)![1].matchAll(/'(\w+)'/g)) tables.add(name[1])
    for (const never of ['Product', 'ProductVariant', 'ProductImage', 'Collection', 'Page', 'Theme', 'ThemeVersion', 'MediaAsset', 'Coupon', 'ShippingZone', 'ShippingRate', 'AdSpend', 'PurchaseOrder', 'InventoryItem']) assert.ok(!tables.has(never), `never deletes ${never}`)
    // Settings: only newsletter signups; users: only customer accounts.
    assert.deepEqual([...source.matchAll(/DELETE FROM "Setting" WHERE ([^`]+)`/g)].map(m => m[1]), [`key LIKE 'newsletter.subscriber.%'`])
    assert.match(source, /DELETE FROM "User" WHERE id IN \(SELECT id FROM gone_users\)/)
    assert.match(source, /SELECT u\.id FROM "User" u WHERE u\.role = 'CUSTOMER'/)
    // Personal details never reach the log: the order list has no name, email, phone or address.
    const list = source.slice(source.indexOf('async function orderList'), source.indexOf('async function stockList'))
    assert.doesNotMatch(list, /email|phone|shippingAddressJson|"name"/)
  })

  it('runs only by hand, checks first, backs up, then cleans', () => {
    const wf = readFileSync('.github/workflows/launch-cleanup.yml', 'utf8')
    assert.match(wf, /^on:\n  workflow_dispatch:/m)
    assert.doesNotMatch(wf, /^\s+(push|schedule|pull_request):/m)
    assert.match(wf, /backup:\n    name: Backup first\n    needs: check\n    if: inputs\.mode == 'clean'\n    uses: \.\/\.github\/workflows\/database-backup\.yml/)
    assert.match(wf, /clean:\n    name: Remove the test data\n    needs: \[check, backup\]/)
    assert.match(wf, /args\+=\(--strict --confirm "\$CONFIRM"\)/)
    // Typed inputs reach the scripts as environment variables, never pasted into the commands.
    for (const line of wf.split('\n').filter(l => l.includes('${{'))) assert.match(line, /^\s+[A-Za-z_]+: \$\{\{ [\w.]+ \}\}$/, line)
    const backup = readFileSync('.github/workflows/database-backup.yml', 'utf8')
    assert.match(backup, /workflow_call:/)
    assert.match(backup, /case "\$LABEL" in \*\[!a-z0-9-\]\*\)/)
  })
})
