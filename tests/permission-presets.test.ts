import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ALL_PERMISSIONS, OWNER_ONLY_PERMISSIONS } from '../lib/permissions'
import { ROLE_PRESETS } from '../lib/permission-presets'

const preset = (key: string) => ROLE_PRESETS.find(p => p.key === key)!

describe('role presets', () => {
  it('uses only permissions that exist', () => {
    for (const p of ROLE_PRESETS) {
      for (const permission of p.permissions) assert.ok(ALL_PERMISSIONS.includes(permission), `${p.key}: ${permission}`)
    }
  })

  it('never gives owner-only access, settings or API credentials', () => {
    for (const p of ROLE_PRESETS) {
      for (const owner of OWNER_ONLY_PERMISSIONS) assert.ok(!p.permissions.includes(owner), `${p.key} has ${owner}`)
      assert.ok(!p.permissions.includes('settings.manage'), `${p.key} has settings.manage`)
      assert.ok(!p.permissions.some(x => x.startsWith('apiCredentials.')), `${p.key} has API credentials`)
    }
  })

  it('has unique keys and names', () => {
    assert.equal(new Set(ROLE_PRESETS.map(p => p.key)).size, ROLE_PRESETS.length)
    assert.equal(new Set(ROLE_PRESETS.map(p => p.name)).size, ROLE_PRESETS.length)
  })

  it('lets a cashier sell, open a shift, refund at the till and add customers', () => {
    const cashier = preset('cashier').permissions
    assert.ok(cashier.includes('orders.manage'))
    assert.ok(cashier.includes('orders.refund'))
    assert.ok(cashier.includes('customers.manage'))
    assert.ok(!cashier.includes('products.manage'))
    assert.ok(!cashier.includes('reports.view'))
  })

  it('makes the viewer read-only', () => {
    for (const permission of preset('viewer').permissions) {
      assert.ok(permission.endsWith('.view'), `viewer has ${permission}`)
    }
  })

  it('gives the ERP administrator everything except the owner-only permissions', () => {
    const erp = preset('erp-administrator').permissions
    const expected = ALL_PERMISSIONS.filter(p => !OWNER_ONLY_PERMISSIONS.includes(p) && p !== 'settings.manage' && !p.startsWith('apiCredentials.'))
    assert.deepEqual([...erp].sort(), [...expected].sort())
  })
})
