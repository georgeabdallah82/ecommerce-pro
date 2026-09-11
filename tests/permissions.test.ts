import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hasPermission, ROLE_PERMISSIONS, type Permission } from '@/lib/permissions'
import { Role } from '@prisma/client'

const ALL_PERMISSIONS = ROLE_PERMISSIONS.SUPER_ADMIN

describe('lib/permissions', () => {
  describe('hasPermission', () => {
    it('grants SUPER_ADMIN every permission', () => {
      for (const permission of ALL_PERMISSIONS) {
        assert.equal(hasPermission(Role.SUPER_ADMIN, permission), true, `SUPER_ADMIN should have ${permission}`)
      }
    })

    it('grants CUSTOMER no permissions', () => {
      for (const permission of ALL_PERMISSIONS) {
        assert.equal(hasPermission(Role.CUSTOMER, permission), false, `CUSTOMER should not have ${permission}`)
      }
    })

    it('never lets ADMIN escalate its own privileges via settings.manage or users.manage', () => {
      assert.equal(hasPermission(Role.ADMIN, 'settings.manage'), false)
      assert.equal(hasPermission(Role.ADMIN, 'users.manage'), false)
      // but ADMIN can still see who has access
      assert.equal(hasPermission(Role.ADMIN, 'users.view'), true)
    })

    it('grants ADMIN every other permission besides the two carve-outs', () => {
      const carveOuts: Permission[] = ['settings.manage', 'users.manage']
      for (const permission of ALL_PERMISSIONS) {
        const expected = !carveOuts.includes(permission)
        assert.equal(hasPermission(Role.ADMIN, permission), expected, `ADMIN permission mismatch for ${permission}`)
      }
    })

    it('excludes user/content-management and settings from MANAGER', () => {
      const excluded: Permission[] = [
        'settings.manage', 'users.view', 'users.manage', 'activity.view',
        'media.manage', 'content.manage', 'themes.manage', 'navigation.manage',
        'webhooks.manage', 'apiCredentials.manage',
      ]
      for (const permission of excluded) {
        assert.equal(hasPermission(Role.MANAGER, permission), false, `MANAGER should not have ${permission}`)
      }
      // sanity check MANAGER still has day-to-day operational access
      assert.equal(hasPermission(Role.MANAGER, 'orders.manage'), true)
      assert.equal(hasPermission(Role.MANAGER, 'products.manage'), true)
    })

    it('limits SUPPORT to its exact allowlist', () => {
      const allowed: Permission[] = [
        'dashboard.view',
        'orders.view', 'orders.manage',
        'draftOrders.view', 'draftOrders.manage',
        'fulfillments.view', 'fulfillments.manage',
        'returns.view', 'returns.manage',
        'customers.view', 'customers.manage',
        'customerSegments.view', 'customerTags.view',
        'storeCredit.view',
        'reviews.view', 'reviews.manage',
      ]
      for (const permission of ALL_PERMISSIONS) {
        const expected = allowed.includes(permission)
        assert.equal(hasPermission(Role.SUPPORT, permission), expected, `SUPPORT permission mismatch for ${permission}`)
      }
      // SUPPORT must never touch money-moving or catalog-editing permissions
      assert.equal(hasPermission(Role.SUPPORT, 'orders.refund'), false)
      assert.equal(hasPermission(Role.SUPPORT, 'products.manage'), false)
      assert.equal(hasPermission(Role.SUPPORT, 'settings.manage'), false)
    })

    it('limits EDITOR to its exact allowlist', () => {
      const allowed: Permission[] = [
        'dashboard.view',
        'products.view', 'products.manage',
        'categories.view', 'categories.manage',
        'collections.view', 'collections.manage',
        'reviews.view', 'reviews.manage',
        'content.view', 'content.manage',
        'media.view', 'media.manage',
        'navigation.view', 'navigation.manage',
        'themes.view', 'themes.manage',
        'metafields.view', 'metafields.manage',
      ]
      for (const permission of ALL_PERMISSIONS) {
        const expected = allowed.includes(permission)
        assert.equal(hasPermission(Role.EDITOR, permission), expected, `EDITOR permission mismatch for ${permission}`)
      }
      // EDITOR must never touch orders, customers or money
      assert.equal(hasPermission(Role.EDITOR, 'orders.view'), false)
      assert.equal(hasPermission(Role.EDITOR, 'customers.view'), false)
      assert.equal(hasPermission(Role.EDITOR, 'storeCredit.view'), false)
    })

    it('fails closed for an unrecognized role rather than throwing', () => {
      // @ts-expect-error deliberately exercising an unknown role at runtime
      assert.equal(hasPermission('NOT_A_REAL_ROLE', 'dashboard.view'), false)
    })
  })
})
