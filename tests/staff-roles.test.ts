import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ALL_PERMISSIONS, hasPermission, permissionsFor } from '@/lib/permissions'
import { cleanPermissions, parseStaffRoles, resolvePermissions } from '@/lib/staff-roles'
import { PERMISSION_SECTIONS } from '@/lib/permission-groups'
import { defaultPolicyHtml } from '@/lib/policy-templates'

describe('custom staff roles', () => {
  const roles = [{ id: 'r1', name: 'Delivery', description: '', permissions: ['orders.view', 'fulfillments.manage'] as any }]
  it('a custom role grants exactly its permissions', () => {
    const perms = resolvePermissions({ role: 'SUPPORT', staffRoleId: 'r1' }, roles)
    assert.deepEqual(perms, ['orders.view', 'fulfillments.manage'])
    assert.equal(hasPermission({ role: 'SUPPORT', permissions: perms }, 'customers.view'), false)
    assert.equal(hasPermission({ role: 'SUPPORT', permissions: perms }, 'orders.view'), true)
  })
  it('a deleted custom role leaves no access, and customers never get any', () => {
    assert.deepEqual(resolvePermissions({ role: 'SUPPORT', staffRoleId: 'gone' }, roles), [])
    assert.deepEqual(permissionsFor({ role: 'CUSTOMER', permissions: ['orders.view'] }), [])
  })
  it('built-in roles still decide when no custom role is set', () => {
    assert.equal(hasPermission('SUPER_ADMIN', 'users.manage'), true)
    assert.equal(hasPermission({ role: 'ADMIN' }, 'users.manage'), false)
  })
  it('custom roles can never include staff management or unknown permissions', () => {
    assert.deepEqual(cleanPermissions(['users.manage', 'orders.view', 'nope', 'orders.view']), ['orders.view'])
    assert.deepEqual(parseStaffRoles('{bad json'), [])
    assert.deepEqual(parseStaffRoles(JSON.stringify([{ id: 'x', name: 'X', permissions: ['users.manage', 'products.view'] }]))[0].permissions, ['products.view'])
  })
  it('the role builder offers every permission except owner-only ones', () => {
    const offered = new Set(PERMISSION_SECTIONS.flatMap(s => s.areas.flatMap(a => [a.view, a.manage, ...(a.extra || []).map(x => x.permission)].filter(Boolean))))
    assert.deepEqual(ALL_PERMISSIONS.filter(p => !offered.has(p)), ['users.manage'])
  })
})

describe('default policy text', () => {
  const vars = { brand: 'Yalla <Haul>', currency: 'USD', country: 'Lebanon', phone: '+961 70 000 000', returnDays: '14', refundTime: '5–10 days', damageReportHours: '48', returnsEnabled: true }
  it('fills in store details, escaped', () => {
    const html = defaultPolicyHtml('refund', vars)
    assert.ok(html.includes('within 14 days') && html.includes('Yalla &lt;Haul&gt;'))
  })
  it('says all sales are final when returns are off', () => {
    assert.ok(defaultPolicyHtml('refund', { ...vars, returnsEnabled: false }).includes('all sales are final'))
    assert.ok(defaultPolicyHtml('terms', { ...vars, returnsEnabled: false }).includes('All sales are final'))
  })
})
