import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dashboardAccess } from '../lib/dashboard-access'
import { ROLE_PERMISSIONS, hasPermission, type Permission } from '../lib/permissions'

const forRole = (role: keyof typeof ROLE_PERMISSIONS) => {
  const granted = new Set<Permission>(ROLE_PERMISSIONS[role])
  return dashboardAccess(permission => granted.has(permission))
}

describe('dashboard access', () => {
  it('shows money, activity and stock to a role that holds those permissions', () => {
    assert.deepEqual(dashboardAccess(() => true), { money: true, activity: true, stock: true })
  })

  it('hides money, activity and stock from a role without them', () => {
    const none = dashboardAccess(permission => permission === 'dashboard.view')
    assert.deepEqual(none, { money: false, activity: false, stock: false })
  })

  it('follows the real role map: support staff cannot see money or the activity log', () => {
    const support = forRole('SUPPORT')
    assert.equal(support.money, false)
    assert.equal(support.activity, false)
  })

  it('agrees with hasPermission for the super admin role', () => {
    const superAdmin = { role: 'SUPER_ADMIN' as const, permissions: null }
    const access = dashboardAccess(permission => hasPermission(superAdmin, permission))
    assert.equal(access.money && access.activity && access.stock, true)
  })
})
